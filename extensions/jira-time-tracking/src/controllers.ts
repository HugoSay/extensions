import { parseDate } from "./utils";
import { jiraRequest } from "./requests";
import { issuesValidator, paginationValidator, projectsValidator, jqlSearchValidator } from "./validators";
import { getPreferenceValues } from "@raycast/api";
import { Project, IssueWithWorklogs, WorklogEntry } from "./types";

// Helpers to define the structure for preferences
type UserPreferences = {
  isJiraCloud: string;
  username: string;
  customJQL: string;
};

const userPrefs = getPreferenceValues<UserPreferences>();

// Helper function to determine the correct API path based on Jira type
function getApiPath(path: string): string {
  const isJiraCloud = userPrefs.isJiraCloud === "cloud";
  const version = isJiraCloud ? "3" : "2";

  // Customize endpoint paths for version compatibility
  if (!isJiraCloud) {
    if (path.includes("/project/search")) {
      path = path.replace("/rest/api/3/project/search", "/rest/api/2/project");
    } else if (path.includes("/search")) {
      path = path.replace("/rest/api/3/search", "/rest/api/2/search");
    } else {
      path = path.replace("/rest/api/3", `/rest/api/${version}`);
    }
  }
  return path;
}

export const getProjects = async (begin: number) => {
  const basePath = `/rest/api/3/project/search?maxResults=500&startAt=${begin}`;
  const apiPath = getApiPath(basePath);
  console.log(`Fetching projects from: ${apiPath}`); // Debugging log
  const response = await jiraRequest(apiPath);
  console.log(`Response from Jira: ${JSON.stringify(response)}`); // Debugging log
  return {
    total: handlePaginationResp(response),
    data: handleProjectResp(response),
  };
};

export const getIssues = async (nextPageToken: string | null | undefined, projectId?: string) => {
  const isJiraCloud = userPrefs.isJiraCloud === "cloud";

  // Jira Server still uses the old endpoint with offset pagination
  if (!isJiraCloud) {
    const begin = typeof nextPageToken === "string" ? parseInt(nextPageToken, 10) || 0 : 0;
    const jqlParts = [];

    if (projectId) {
      jqlParts.push(`project=${projectId}`);
    }

    if (userPrefs.customJQL) {
      jqlParts.push(`(${userPrefs.customJQL})`);
    }

    const jql = jqlParts.length > 0 ? `&jql=${jqlParts.join(" AND ")}` : "";
    const basePath = `/rest/api/3/search?fields=summary,parent,project&maxResults=500&startAt=${begin}${jql}`;
    const apiPath = getApiPath(basePath);

    console.log(`Fetching issues from (Jira Server): ${apiPath}`);
    const response = await jiraRequest(apiPath);

    return {
      total: handlePaginationResp(response),
      data: handleIssueResp(response),
      nextPageToken: (begin + 500).toString(), // Use offset as token for Server
    };
  }

  // Jira Cloud uses the new JQL search endpoint with cursor pagination
  const jqlParts = [];

  if (projectId) {
    jqlParts.push(`project=${projectId}`);
  }

  if (userPrefs.customJQL) {
    jqlParts.push(`(${userPrefs.customJQL})`);
  }

  const jql = jqlParts.length > 0 ? jqlParts.join(" AND ") : "";

  // Build request body for POST /rest/api/3/search/jql
  const requestBody: Record<string, unknown> = {
    jql,
    fields: ["summary", "parent", "project"],
    maxResults: 500,
  };

  // Only include nextPageToken if it's not null/undefined
  if (nextPageToken) {
    requestBody.nextPageToken = nextPageToken;
  }

  const apiPath = "/rest/api/3/search/jql";
  console.log(`Fetching issues from (Jira Cloud): ${apiPath}`);
  console.log(`Request body: ${JSON.stringify(requestBody)}`);

  const response = await jiraRequest(apiPath, JSON.stringify(requestBody), "POST");

  return {
    total: handleJqlSearchResp(response).total,
    data: handleJqlSearchResp(response).data,
    nextPageToken: handleJqlSearchResp(response).nextPageToken,
  };
};

const handlePaginationResp = (resp: unknown) => {
  return paginationValidator(resp) ? resp.total : 0;
};

const handleProjectResp = (resp: unknown): Project[] => {
  // Validate the response using the updated `projectsValidator`
  if (!projectsValidator(resp)) {
    console.error("Invalid project response structure:", resp);
    return [];
  }

  // Handle the validated response
  if (Array.isArray(resp)) {
    // Handle API v2 structure (Jira Server)
    return resp.map((project) => ({
      key: project.key,
      name: project.name.trim(),
    }));
  } else if (resp.values) {
    // Handle API v3 structure (Jira Cloud)
    return resp.values.map((project) => ({
      key: project.key,
      name: project.name.trim(),
    }));
  }

  // This point should not be reached due to validation, but add a fallback
  console.error("Unexpected project response format after validation:", resp);
  return [];
};

const handleIssueResp = (resp: unknown) => {
  return issuesValidator(resp) ? resp.issues : [];
};

const handleJqlSearchResp = (resp: unknown) => {
  if (jqlSearchValidator(resp)) {
    return {
      data: resp.issues,
      nextPageToken: resp.nextPageToken || null,
      total: resp.issues.length, // JQL search doesn't provide total count
    };
  }
  return {
    data: [],
    nextPageToken: null,
    total: 0,
  };
};

export const postTimeLog = async (timeSpentSeconds: number, issueId: string, description: string, startedAt: Date) => {
  const basePath = `/rest/api/3/issue/${issueId}/worklog?notifyUsers=false`;
  const apiPath = getApiPath(basePath);

  const isJiraCloud = userPrefs.isJiraCloud === "cloud";

  const comment = isJiraCloud
    ? {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                text: description,
                type: "text",
              },
            ],
          },
        ],
      }
    : description;

  const body = JSON.stringify({
    timeSpentSeconds,
    comment, // Use the conditionally formatted comment
    started: parseDate(startedAt),
  });

  const success = await jiraRequest(apiPath, body, "POST");
  return success;
};

export const updateWorklog = async (
  issueId: string,
  worklogId: string,
  timeSpentSeconds: number,
  description: string,
  startedAt: Date,
) => {
  const basePath = `/rest/api/3/issue/${issueId}/worklog/${worklogId}?notifyUsers=false`;
  const apiPath = getApiPath(basePath);

  const isJiraCloud = userPrefs.isJiraCloud === "cloud";

  const comment = isJiraCloud
    ? {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [
              {
                text: description,
                type: "text",
              },
            ],
          },
        ],
      }
    : description;

  const body = JSON.stringify({
    timeSpentSeconds,
    comment,
    started: parseDate(startedAt),
  });

  const success = await jiraRequest(apiPath, body, "PUT");
  return success;
};

export const deleteWorklog = async (issueId: string, worklogId: string) => {
  const basePath = `/rest/api/3/issue/${issueId}/worklog/${worklogId}?notifyUsers=false`;
  const apiPath = getApiPath(basePath);

  const success = await jiraRequest(apiPath, undefined, "DELETE");
  return success;
};

// Cache for current user's accountId
let currentUserAccountId: string | null = null;

// Fetch current user's accountId from Jira
const getCurrentUserAccountId = async (isJiraCloud: boolean): Promise<string | null> => {
  if (currentUserAccountId) {
    return currentUserAccountId;
  }

  try {
    const apiPath = isJiraCloud ? "/rest/api/3/myself" : "/rest/api/2/myself";
    const response = await jiraRequest(apiPath);

    if (response && typeof response === "object" && "accountId" in response) {
      currentUserAccountId = response.accountId as string;
      return currentUserAccountId;
    } else if (response && typeof response === "object" && "name" in response) {
      // Jira Server uses "name" field
      currentUserAccountId = response.name as string;
      return currentUserAccountId;
    }
  } catch (error) {
    console.error("Failed to fetch current user info:", error);
  }

  return null;
};

export const getWorklogs = async (startDate: Date, endDate: Date): Promise<WorklogEntry[]> => {
  const isJiraCloud = userPrefs.isJiraCloud === "cloud";

  // Format dates for JQL (YYYY-MM-DD)
  const formatDateForJQL = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const startDateStr = formatDateForJQL(startDate);
  const endDateStr = formatDateForJQL(endDate);

  // Build JQL query to find issues with worklogs in date range by current user
  const jql = `worklogDate >= "${startDateStr}" AND worklogDate <= "${endDateStr}" AND worklogAuthor = currentUser()`;

  if (!isJiraCloud) {
    // Jira Server uses v2 API
    const basePath = `/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary,project&maxResults=1000`;
    const apiPath = getApiPath(basePath);

    const response = await jiraRequest(apiPath);

    return extractWorklogEntriesWithFetch(response, startDate, endDate, isJiraCloud);
  }

  // Jira Cloud uses v3 JQL search API with POST
  // Don't fetch worklog field here - we'll fetch it separately per issue to get ALL worklogs
  const requestBody = {
    jql,
    fields: ["summary", "project"],
    maxResults: 1000,
  };

  const apiPath = "/rest/api/3/search/jql";

  const response = await jiraRequest(apiPath, JSON.stringify(requestBody), "POST");

  return extractWorklogEntriesWithFetch(response, startDate, endDate, isJiraCloud);
};

// Fetch ALL worklogs for each issue (handling pagination) - using parallel requests
const extractWorklogEntriesWithFetch = async (
  response: unknown,
  startDate: Date,
  endDate: Date,
  isJiraCloud: boolean,
): Promise<WorklogEntry[]> => {
  if (!issuesValidator(response)) {
    console.error("Invalid issue response:", response);
    return [];
  }

  const issues = response.issues as IssueWithWorklogs[];

  // Get current user's accountId from Jira API
  const currentUserAccountIdFromApi = await getCurrentUserAccountId(isJiraCloud);

  // Fetch worklogs for all issues in parallel
  const worklogPromises = issues.map(async (issue) => {
    try {
      const worklogPath = isJiraCloud
        ? `/rest/api/3/issue/${issue.key}/worklog`
        : `/rest/api/2/issue/${issue.key}/worklog`;
      const apiPath = getApiPath(worklogPath);

      const worklogResponse = await jiraRequest(apiPath);

      const entries: WorklogEntry[] = [];

      if (worklogResponse && typeof worklogResponse === "object" && "worklogs" in worklogResponse) {
        const worklogs = (worklogResponse as { worklogs: unknown }).worklogs;
        if (Array.isArray(worklogs)) {
          worklogs.forEach((worklog: unknown) => {
            if (worklog && typeof worklog === "object" && "started" in worklog && typeof worklog.started === "string") {
              const worklogDate = new Date(worklog.started);
              const isInRange = worklogDate >= startDate && worklogDate <= endDate;

              // Check if the worklog author matches current user
              let isCurrentUser = false;
              if ("author" in worklog && worklog.author && typeof worklog.author === "object") {
                if (isJiraCloud) {
                  // Jira Cloud: Check accountId against the fetched accountId from API
                  const accountId = "accountId" in worklog.author ? worklog.author.accountId : null;
                  isCurrentUser = accountId === currentUserAccountIdFromApi;
                } else {
                  // Jira Server: Check name field against the fetched name from API
                  const authorName = "name" in worklog.author ? worklog.author.name : null;
                  isCurrentUser = authorName === currentUserAccountIdFromApi;
                }
              }

              if (isInRange && isCurrentUser) {
                entries.push({
                  worklog: worklog as WorklogEntry["worklog"],
                  issue: {
                    key: issue.key,
                    summary: issue.fields.summary,
                    project: {
                      key: issue.fields.project?.key || "",
                      name: issue.fields.project?.name || "",
                    },
                  },
                });
              }
            }
          });
        }
      }

      return entries;
    } catch (error) {
      console.error(`Failed to fetch worklogs for ${issue.key}:`, error);
      return [];
    }
  });

  // Wait for all requests to complete in parallel
  const allEntries = await Promise.all(worklogPromises);

  // Flatten the array of arrays into a single array
  const entries = allEntries.flat();

  // Sort by date descending (newest first)
  entries.sort((a, b) => new Date(b.worklog.started).getTime() - new Date(a.worklog.started).getTime());

  return entries;
};

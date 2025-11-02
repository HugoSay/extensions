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

  // Build JQL query to find issues with worklogs in date range
  const jql = `worklogDate >= "${startDateStr}" AND worklogDate <= "${endDateStr}" AND worklogAuthor = currentUser()`;

  if (!isJiraCloud) {
    // Jira Server uses v2 API
    const basePath = `/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary,project,worklog&maxResults=1000`;
    const apiPath = getApiPath(basePath);

    console.log(`Fetching worklogs from (Jira Server): ${apiPath}`);
    const response = await jiraRequest(apiPath);

    return extractWorklogEntries(response, startDate, endDate);
  }

  // Jira Cloud uses v3 JQL search API with POST
  const requestBody = {
    jql,
    fields: ["summary", "project", "worklog"],
    maxResults: 1000,
  };

  const apiPath = "/rest/api/3/search/jql";
  console.log(`Fetching worklogs from (Jira Cloud): ${apiPath}`);
  const response = await jiraRequest(apiPath, JSON.stringify(requestBody), "POST");

  return extractWorklogEntries(response, startDate, endDate);
};

const extractWorklogEntries = (response: unknown, startDate: Date, endDate: Date): WorklogEntry[] => {
  if (!issuesValidator(response)) {
    console.error("Invalid worklog response:", response);
    return [];
  }

  const issues = response.issues as IssueWithWorklogs[];
  const entries: WorklogEntry[] = [];
  const currentUsername = userPrefs.username;

  issues.forEach((issue) => {
    const worklogs = issue.fields.worklog?.worklogs || [];

    worklogs.forEach((worklog) => {
      // Filter by date range and current user
      const worklogDate = new Date(worklog.started);
      const isInRange = worklogDate >= startDate && worklogDate <= endDate;
      const isCurrentUser =
        worklog.author.displayName === currentUsername || worklog.author.accountId.includes(currentUsername);

      if (isInRange && isCurrentUser) {
        entries.push({
          worklog,
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
    });
  });

  // Sort by date descending (newest first)
  entries.sort((a, b) => new Date(b.worklog.started).getTime() - new Date(a.worklog.started).getTime());

  return entries;
};

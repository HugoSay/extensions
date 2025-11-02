export type CommandForm = {
  projectId: string;
  issueId: string;
  startedAt?: string;
  hours?: string;
  minutes?: string;
  seconds?: string;
  description?: string;
};

export type Project = {
  name: string;
  key: string;
};

export type JiraType = "cloud" | "server";

export type Preferences = {
  jiraType: JiraType;
  domain: string;
  token: string;
  username: string;
  customJQL: string;
};

export type Issue = {
  key: string;
  fields: {
    summary: string;
    project?: {
      key: string;
      name: string;
    };
  };
};

export type Result = {
  total: number;
  data: Issue[] | Project[];
  nextPageToken?: string | null;
};

export type IssueBody = {
  issues: Issue[];
  nextPageToken?: string | null;
} & unknown;

export type ProjectBody = {
  values: { key: string; name: string }[];
} & unknown;

export type PaginationBody = {
  maxResults: number;
  startAt: number;
  total: number;
};

export type JqlSearchBody = {
  issues: Issue[];
  nextPageToken?: string | null;
} & unknown;

export type JiraErrorResponseBody = {
  message?: string;
  messages?: string[];
} & unknown;

export type Worklog = {
  id: string;
  issueId: string;
  author: {
    accountId: string;
    displayName: string;
  };
  timeSpentSeconds: number;
  comment?: string | WorklogComment;
  started: string;
  created: string;
  updated: string;
};

export type WorklogComment = {
  type: string;
  version: number;
  content: Array<{
    type: string;
    content?: Array<{
      type: string;
      text: string;
    }>;
  }>;
};

export type IssueWithWorklogs = Issue & {
  fields: Issue["fields"] & {
    worklog?: {
      worklogs: Worklog[];
    };
  };
};

export type DailyWorklog = {
  date: Date;
  entries: WorklogEntry[];
  totalSeconds: number;
};

export type WorklogEntry = {
  worklog: Worklog;
  issue: {
    key: string;
    summary: string;
    project: {
      key: string;
      name: string;
    };
  };
};

# Jira Time Tracking

This extension helps you to quickly log, view, and manage time tracking on Jira issues. It supports both Jira Server and Jira Cloud users.

## Features

### Log Time
- Quickly log time to any Jira issue
- Select project and issue from dropdown menus
- Enter time in flexible format (e.g., `2h 30m`, `1h`, `45m`)
- Add descriptions to your work logs
- Choose the date when the work was performed

### View Logged Time
- Browse your logged time by month with weekday view
- Navigate between months (Previous/Next/Current)
- See daily totals and monthly summary
- Visual indicators for days below your daily hours threshold
- Timezone-aware date grouping

### Manage Work Logs
- **Edit Work Logs** (`Cmd+E`): Update time, description, or date of existing logs
- **Delete Work Logs**: Remove incorrect entries with confirmation
- **Log More Time** (`Cmd+L`): Quickly add more time to the same issue
- **Log Time on Another Task** (`Cmd+Shift+L`): Switch to a different issue

### Advanced Filtering
Filter your logged time using powerful search syntax:
- `<5` - Show days with less than 5 hours logged
- `>7` - Show days with more than 7 hours logged
- `=8` or `8` - Show days with exactly 8 hours logged
- Text search - Search by issue key, summary, or description (e.g., "APM-9795", "bug fix")

## Setup

To use this extension, you need to configure the following preferences:

- **Jira Instance Type**: Select whether you are using Jira Cloud or Jira Server.
- **Jira Domain**: The domain/site URL of your Jira instance, e.g., `company.atlassian.net`.
- **Jira Username**:
  - For Jira Cloud: Your email address
  - For Jira Server: Your username
- **API Token**: An API token created as described in [Manage API tokens for your Atlassian account](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/).
- **Custom JQL Query**: Enter a JQL query to filter issues dynamically (optional). Example: `assignee = currentUser() AND status = "In Progress"`.
- **Default Project Key**: The key of the project to be selected by default (optional). Example: `MYPROJECT`.
- **Daily Hours Threshold**: Set your expected daily working hours (default: 7). Days below this threshold will show a reminder to log more time.

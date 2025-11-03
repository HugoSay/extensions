import { useState, useEffect } from "react";
import {
  List,
  ActionPanel,
  Action,
  showToast,
  Toast,
  Icon,
  Color,
  getPreferenceValues,
  Form,
  useNavigation,
  confirmAlert,
  Alert,
} from "@raycast/api";
import { getWorklogs, updateWorklog, postTimeLog, deleteWorklog } from "./controllers";
import { DailyWorklog, WorklogEntry, WorklogComment } from "./types";
import { parseTimeToSeconds, createTimeLogSuccessMessage } from "./utils";
import Command from "./index";

type Preferences = {
  dailyHoursThreshold?: string;
  domain?: string;
};

// Form to edit existing worklog
function EditWorklogForm({
  entry,
  onSuccess,
}: {
  entry: WorklogEntry;
  onSuccess: () => void;
}) {
  const { pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);

  const formatSecondsToTimeString = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0) parts.push(`${secs}s`);

    return parts.join(" ") || "0s";
  };

  const extractCommentText = (comment?: string | WorklogComment): string => {
    if (!comment) return "";
    if (typeof comment === "string") return comment;

    const texts: string[] = [];
    comment.content?.forEach((block) => {
      block.content?.forEach((item) => {
        if (item.text) {
          texts.push(item.text);
        }
      });
    });
    return texts.join(" ");
  };

  const [timeInput, setTimeInput] = useState(formatSecondsToTimeString(entry.worklog.timeSpentSeconds));
  const [description, setDescription] = useState(extractCommentText(entry.worklog.comment));
  const [startedAt, setStartedAt] = useState(new Date(entry.worklog.started));

  const handleSubmit = async (values: { timeInput: string; description: string; startedAt: Date }) => {
    setIsLoading(true);
    try {
      const timeSpentSeconds = parseTimeToSeconds(values.timeInput);

      if (timeSpentSeconds <= 0) {
        showToast(Toast.Style.Failure, "Please enter a valid time");
        setIsLoading(false);
        return;
      }

      await updateWorklog(entry.issue.key, entry.worklog.id, timeSpentSeconds, values.description, values.startedAt);

      showToast(Toast.Style.Success, "Worklog updated successfully");
      onSuccess();
      pop();
    } catch (error) {
      showToast(Toast.Style.Failure, "Failed to update worklog", error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirmAlert({
      title: "Delete Worklog",
      message: "Are you sure you want to delete this worklog? This action cannot be undone.",
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
    });

    if (!confirmed) return;

    setIsLoading(true);
    try {
      await deleteWorklog(entry.issue.key, entry.worklog.id);
      showToast(Toast.Style.Success, "Worklog deleted successfully");
      onSuccess();
      pop();
    } catch (error) {
      showToast(Toast.Style.Failure, "Failed to delete worklog", error instanceof Error ? error.message : String(error));
      setIsLoading(false);
    }
  };

  return (
    <Form
      isLoading={isLoading}
      navigationTitle={`Edit Worklog - ${entry.issue.key}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Update Worklog" onSubmit={handleSubmit} />
          <Action title="Delete Worklog" icon={Icon.Trash} style={Action.Style.Destructive} onAction={handleDelete} />
        </ActionPanel>
      }
    >
      <Form.Description title="Issue" text={`${entry.issue.key}: ${entry.issue.summary}`} />
      <Form.Separator />
      <Form.DatePicker id="startedAt" title="Date" value={startedAt} onChange={(date) => date && setStartedAt(date)} />
      <Form.TextField
        id="timeInput"
        title="Time (e.g., 2h 15m 30s)"
        placeholder="Enter time as 'Xh Ym Zs'"
        value={timeInput}
        onChange={setTimeInput}
      />
      <Form.TextArea
        id="description"
        title="Description"
        placeholder="Description of work completed"
        value={description}
        onChange={setDescription}
      />
    </Form>
  );
}

// Form to add more time to an issue
function AddTimeToIssueForm({ issueKey, issueSummary, onSuccess }: { issueKey: string; issueSummary: string; onSuccess: () => void }) {
  const { pop } = useNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const [timeInput, setTimeInput] = useState("");
  const [description, setDescription] = useState("");
  const [startedAt, setStartedAt] = useState(new Date());

  const handleSubmit = async (values: { timeInput: string; description: string; startedAt: Date }) => {
    setIsLoading(true);
    try {
      const timeSpentSeconds = parseTimeToSeconds(values.timeInput);

      if (timeSpentSeconds <= 0) {
        showToast(Toast.Style.Failure, "Please enter a valid time");
        setIsLoading(false);
        return;
      }

      await postTimeLog(timeSpentSeconds, issueKey, values.description, values.startedAt);

      const successMessage = createTimeLogSuccessMessage(issueKey, timeSpentSeconds);
      showToast(Toast.Style.Success, successMessage);
      onSuccess();
      pop();
    } catch (error) {
      showToast(Toast.Style.Failure, "Failed to log time", error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form
      isLoading={isLoading}
      navigationTitle={`Log Time - ${issueKey}`}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Log Time" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description title="Issue" text={`${issueKey}: ${issueSummary}`} />
      <Form.Separator />
      <Form.DatePicker id="startedAt" title="Date" value={startedAt} onChange={(date) => date && setStartedAt(date)} />
      <Form.TextField
        id="timeInput"
        title="Time (e.g., 2h 15m 30s)"
        placeholder="Enter time as 'Xh Ym Zs'"
        value={timeInput}
        onChange={setTimeInput}
      />
      <Form.TextArea
        id="description"
        title="Description"
        placeholder="Description of work completed"
        value={description}
        onChange={setDescription}
      />
    </Form>
  );
}

// Cache for worklog entries by month (format: "YYYY-MM")
const worklogCache = new Map<string, WorklogEntry[]>();

export default function ViewLoggedTime() {
  const preferences = getPreferenceValues<Preferences>();
  const dailyHoursThreshold = parseFloat(preferences.dailyHoursThreshold || "7");
  const jiraDomain = preferences.domain || "";
  const { push } = useNavigation();

  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [dailyWorklogs, setDailyWorklogs] = useState<DailyWorklog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showingDetail, setShowingDetail] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [searchText, setSearchText] = useState("");

  // Build Jira issue URL
  const getJiraIssueUrl = (issueKey: string) => {
    const domain = jiraDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${domain}/browse/${issueKey}`;
  };

  // Format month for display
  const formatMonth = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  // Get start and end of month
  const getMonthBounds = (date: Date) => {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
    return { start, end };
  };

  // Navigate to previous month
  const goToPreviousMonth = () => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    console.log(`Navigating to previous month: ${formatMonth(newMonth)}`);
    setCurrentMonth(newMonth);
  };

  // Navigate to next month
  const goToNextMonth = () => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    console.log(`Navigating to next month: ${formatMonth(newMonth)}`);
    setCurrentMonth(newMonth);
  };

  // Jump to current month
  const goToCurrentMonth = () => {
    const newMonth = new Date();
    console.log(`Jumping to current month: ${formatMonth(newMonth)}`);
    setCurrentMonth(newMonth);
  };

  // Format time duration
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (minutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  // Extract text from worklog comment
  const extractCommentText = (comment?: string | WorklogComment): string => {
    if (!comment) return "";
    if (typeof comment === "string") return comment;

    // Handle ADF format
    const texts: string[] = [];
    comment.content?.forEach((block) => {
      block.content?.forEach((item) => {
        if (item.text) {
          texts.push(item.text);
        }
      });
    });
    return texts.join(" ");
  };

  // Helper to format date in local timezone as YYYY-MM-DD
  const formatDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Group worklogs by day
  const groupWorklogsByDay = (entries: WorklogEntry[]): DailyWorklog[] => {
    const { start, end } = getMonthBounds(currentMonth);
    const dailyMap = new Map<string, WorklogEntry[]>();

    // Add all entries to their respective days using local timezone
    entries.forEach((entry) => {
      const date = new Date(entry.worklog.started);
      const dateKey = formatDateKey(date);
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, []);
      }
      const dayEntries = dailyMap.get(dateKey);
      if (dayEntries) {
        dayEntries.push(entry);
      }
    });

    // Generate all weekdays in the month (Monday-Friday only)
    const days: DailyWorklog[] = [];
    const current = new Date(start);

    while (current <= end) {
      const dayOfWeek = current.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

      // Only include weekdays (Monday = 1 to Friday = 5)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const dateKey = formatDateKey(current);
        const dayEntries = dailyMap.get(dateKey) || [];
        const totalSeconds = dayEntries.reduce((sum, entry) => sum + entry.worklog.timeSpentSeconds, 0);

        days.push({
          date: new Date(current),
          entries: dayEntries,
          totalSeconds,
        });
      }

      current.setDate(current.getDate() + 1);
    }

    // Sort by date descending (most recent first)
    days.reverse();

    return days;
  };

  // Get cache key for a month
  const getMonthCacheKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  };

  // Refresh callback - clears cache for current month
  const refreshWorklogs = () => {
    const cacheKey = getMonthCacheKey(currentMonth);
    worklogCache.delete(cacheKey);
    setRefreshTrigger((prev) => prev + 1);
  };

  // Prefetch adjacent months in the background
  const prefetchAdjacentMonths = async (currentDate: Date) => {
    const prefetchMonth = async (date: Date) => {
      const cacheKey = getMonthCacheKey(date);
      if (worklogCache.has(cacheKey)) {
        return; // Already cached
      }

      try {
        const { start, end } = getMonthBounds(date);
        const entries = await getWorklogs(start, end);
        worklogCache.set(cacheKey, entries);
      } catch (error) {
        // Silently fail - this is a background operation
        console.error(`Failed to prefetch ${cacheKey}:`, error);
      }
    };

    // Prefetch previous month
    const prevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    prefetchMonth(prevMonth);

    // Prefetch next month
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    prefetchMonth(nextMonth);
  };

  // Fetch worklogs for current month with caching
  useEffect(() => {
    let isMounted = true;

    const fetchWorklogs = async () => {
      const cacheKey = getMonthCacheKey(currentMonth);

      // Check cache first
      if (worklogCache.has(cacheKey)) {
        const cachedEntries = worklogCache.get(cacheKey)!;
        const grouped = groupWorklogsByDay(cachedEntries);
        setDailyWorklogs(grouped);
        setLoading(false);
        showToast(Toast.Style.Success, `Loaded ${cachedEntries.length} worklogs (cached)`);

        // Prefetch adjacent months in background
        prefetchAdjacentMonths(currentMonth);
        return;
      }

      // Not in cache, fetch from API
      setLoading(true);
      try {
        const { start, end } = getMonthBounds(currentMonth);
        const entries = await getWorklogs(start, end);

        if (isMounted) {
          // Store in cache
          worklogCache.set(cacheKey, entries);

          const grouped = groupWorklogsByDay(entries);
          setDailyWorklogs(grouped);
          showToast(Toast.Style.Success, `Loaded ${entries.length} worklogs`);

          // Prefetch adjacent months in background
          prefetchAdjacentMonths(currentMonth);
        }
      } catch (e) {
        if (isMounted) {
          showToast(Toast.Style.Failure, "Failed to load worklogs", e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchWorklogs();

    return () => {
      isMounted = false;
    };
  }, [currentMonth, refreshTrigger]);

  // Filter worklogs based on search text
  const parseFilter = (text: string): { type: 'less' | 'greater' | 'equal' | 'text'; hours?: number } | null => {
    const trimmed = text.trim();

    // Check for <5 (less than)
    const lessThanMatch = trimmed.match(/^<(\d+(?:\.\d+)?)$/);
    if (lessThanMatch) {
      return { type: 'less', hours: parseFloat(lessThanMatch[1]) };
    }

    // Check for >5 (greater than)
    const greaterThanMatch = trimmed.match(/^>(\d+(?:\.\d+)?)$/);
    if (greaterThanMatch) {
      return { type: 'greater', hours: parseFloat(greaterThanMatch[1]) };
    }

    // Check for =5 or just 5 (equal to)
    const equalMatch = trimmed.match(/^=?(\d+(?:\.\d+)?)$/);
    if (equalMatch) {
      return { type: 'equal', hours: parseFloat(equalMatch[1]) };
    }

    // Otherwise it's text search
    if (trimmed) {
      return { type: 'text' };
    }

    return null;
  };

  const filteredWorklogs = dailyWorklogs.filter((day) => {
    const filter = parseFilter(searchText);

    if (!filter) {
      return true; // No filter, show all
    }

    const dayHours = day.totalSeconds / 3600;

    if (filter.type === 'less' && filter.hours !== undefined) {
      return dayHours < filter.hours;
    }

    if (filter.type === 'greater' && filter.hours !== undefined) {
      return dayHours > filter.hours;
    }

    if (filter.type === 'equal' && filter.hours !== undefined) {
      // Allow some tolerance for floating point comparison
      return Math.abs(dayHours - filter.hours) < 0.01;
    }

    if (filter.type === 'text') {
      // Text search - search in issue keys, summaries, and descriptions
      const searchLower = searchText.toLowerCase();
      return day.entries.some((entry) => {
        const issueKey = entry.issue.key.toLowerCase();
        const summary = entry.issue.summary.toLowerCase();
        const comment = extractCommentText(entry.worklog.comment).toLowerCase();
        return issueKey.includes(searchLower) || summary.includes(searchLower) || comment.includes(searchLower);
      });
    }

    return true;
  });

  // Calculate total for the month
  const monthTotal = dailyWorklogs.reduce((sum, day) => sum + day.totalSeconds, 0);

  return (
    <List
      isLoading={loading}
      isShowingDetail={showingDetail}
      searchBarPlaceholder="Search worklogs or filter by hours (e.g., <5, >7, =8)..."
      navigationTitle={`Logged Time - ${formatMonth(currentMonth)}`}
      onSearchTextChange={setSearchText}
      searchText={searchText}
    >
      {filteredWorklogs.length === 0 && !loading ? (
        <List.EmptyView
          title="No worklogs found"
          description={
            searchText
              ? `No worklogs match "${searchText}"`
              : `No time logged in ${formatMonth(currentMonth)}`
          }
          icon={Icon.Clock}
          actions={
            <ActionPanel>
              <Action title="Previous Month" icon={Icon.ArrowLeft} onAction={goToPreviousMonth} />
              <Action title="Next Month" icon={Icon.ArrowRight} onAction={goToNextMonth} />
              <Action title="Current Month" icon={Icon.Calendar} onAction={goToCurrentMonth} />
            </ActionPanel>
          }
        />
      ) : null}
      {filteredWorklogs.map((day) => {
        const dayLabel = day.date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
        const subtitle = day.totalSeconds > 0 ? formatDuration(day.totalSeconds) : "No time logged";
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dayDate = new Date(day.date);
        dayDate.setHours(0, 0, 0, 0);
        const isFuture = dayDate > today;

        return (
          <List.Section key={day.date.toISOString()} title={dayLabel} subtitle={subtitle}>
            {day.entries.length > 0
              ? day.entries.map((entry) => (
                  <List.Item
                    key={entry.worklog.id}
                    title={entry.issue.key}
                    subtitle={entry.issue.summary}
                    icon={{ source: Icon.Circle, tintColor: Color.Blue }}
                    keywords={[entry.issue.key, entry.issue.summary, entry.issue.project.name]}
                    accessories={[
                      { text: formatDuration(entry.worklog.timeSpentSeconds), icon: Icon.Clock },
                      { text: entry.issue.project.key, icon: Icon.Box },
                    ]}
                    detail={
                      <List.Item.Detail
                        markdown={`## ${entry.issue.key}: ${entry.issue.summary}\n\n${extractCommentText(entry.worklog.comment) || "_No description provided_"}`}
                        metadata={
                          <List.Item.Detail.Metadata>
                            <List.Item.Detail.Metadata.Label title="Issue" text={entry.issue.key} />
                            <List.Item.Detail.Metadata.Label title="Summary" text={entry.issue.summary} />
                            <List.Item.Detail.Metadata.Separator />
                            <List.Item.Detail.Metadata.Label title="Project" text={entry.issue.project.name} />
                            <List.Item.Detail.Metadata.Label title="Project Key" text={entry.issue.project.key} />
                            <List.Item.Detail.Metadata.Separator />
                            <List.Item.Detail.Metadata.Label
                              title="Time Spent"
                              text={formatDuration(entry.worklog.timeSpentSeconds)}
                            />
                            <List.Item.Detail.Metadata.Label
                              title="Started"
                              text={new Date(entry.worklog.started).toLocaleString()}
                            />
                            <List.Item.Detail.Metadata.Label
                              title="Logged By"
                              text={entry.worklog.author.displayName}
                            />
                          </List.Item.Detail.Metadata>
                        }
                      />
                    }
                    actions={
                      <ActionPanel>
                        <Action.OpenInBrowser
                          title="Open in Jira"
                          url={getJiraIssueUrl(entry.issue.key)}
                          icon={Icon.Globe}
                        />
                        <ActionPanel.Section title="Time Logging">
                          <Action
                            title="Edit Worklog"
                            icon={Icon.Pencil}
                            onAction={() =>
                              push(<EditWorklogForm entry={entry} onSuccess={refreshWorklogs} />)
                            }
                            shortcut={{ modifiers: ["cmd"], key: "e" }}
                          />
                          <Action
                            title="Log More Time on This Issue"
                            icon={Icon.Plus}
                            onAction={() =>
                              push(
                                <AddTimeToIssueForm
                                  issueKey={entry.issue.key}
                                  issueSummary={entry.issue.summary}
                                  onSuccess={refreshWorklogs}
                                />,
                              )
                            }
                            shortcut={{ modifiers: ["cmd"], key: "l" }}
                          />
                          <Action.Push
                            title="Log Time on Another Task"
                            icon={Icon.PlusCircle}
                            target={<Command />}
                            shortcut={{ modifiers: ["cmd", "shift"], key: "l" }}
                          />
                        </ActionPanel.Section>
                        <Action
                          title="Toggle Details"
                          icon={Icon.AppWindowSidebarLeft}
                          onAction={() => setShowingDetail(!showingDetail)}
                          shortcut={{ modifiers: ["cmd"], key: "d" }}
                        />
                        <Action.CopyToClipboard
                          title="Copy Issue Key"
                          content={entry.issue.key}
                          shortcut={{ modifiers: ["cmd"], key: "c" }}
                        />
                        <ActionPanel.Section title="Navigation">
                          <Action title="Previous Month" icon={Icon.ArrowLeft} onAction={goToPreviousMonth} />
                          <Action title="Next Month" icon={Icon.ArrowRight} onAction={goToNextMonth} />
                          <Action title="Current Month" icon={Icon.Calendar} onAction={goToCurrentMonth} />
                        </ActionPanel.Section>
                      </ActionPanel>
                    }
                  />
                ))
              : // Show "Log time" prompt only if below threshold and not in the future
                !isFuture &&
                day.totalSeconds < dailyHoursThreshold * 3600 && (
                  <List.Item
                    title="Log time for this day"
                    subtitle={`${formatDuration(day.totalSeconds)} logged - ${formatDuration(dailyHoursThreshold * 3600 - day.totalSeconds)} remaining`}
                    icon={{ source: Icon.PlusCircle, tintColor: Color.SecondaryText }}
                    actions={
                      <ActionPanel>
                        <Action
                          title="Open Log Time"
                          icon={Icon.Plus}
                          onAction={() => {
                            showToast(
                              Toast.Style.Animated,
                              "Opening Log Time",
                              `Pre-fill date: ${day.date.toLocaleDateString()}`,
                            );
                          }}
                        />
                        <Action title="Previous Month" icon={Icon.ArrowLeft} onAction={goToPreviousMonth} />
                        <Action title="Next Month" icon={Icon.ArrowRight} onAction={goToNextMonth} />
                        <Action title="Current Month" icon={Icon.Calendar} onAction={goToCurrentMonth} />
                      </ActionPanel>
                    }
                  />
                )}
          </List.Section>
        );
      })}
      <List.Section title="Summary">
        <List.Item
          title="Total for Month"
          subtitle={formatDuration(monthTotal)}
          icon={{ source: Icon.BarChart, tintColor: Color.Green }}
          actions={
            <ActionPanel>
              <Action title="Previous Month" icon={Icon.ArrowLeft} onAction={goToPreviousMonth} />
              <Action title="Next Month" icon={Icon.ArrowRight} onAction={goToNextMonth} />
              <Action title="Current Month" icon={Icon.Calendar} onAction={goToCurrentMonth} />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

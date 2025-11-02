import { useState, useEffect } from "react";
import { List, ActionPanel, Action, showToast, Toast, Icon, Color, getPreferenceValues } from "@raycast/api";
import { getWorklogs } from "./controllers";
import { DailyWorklog, WorklogEntry, WorklogComment } from "./types";

type Preferences = {
  dailyHoursThreshold?: string;
};

export default function ViewLoggedTime() {
  const preferences = getPreferenceValues<Preferences>();
  const dailyHoursThreshold = parseFloat(preferences.dailyHoursThreshold || "7");

  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [dailyWorklogs, setDailyWorklogs] = useState<DailyWorklog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showingDetail, setShowingDetail] = useState(false);

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

  // Group worklogs by day
  const groupWorklogsByDay = (entries: WorklogEntry[]): DailyWorklog[] => {
    const { start, end } = getMonthBounds(currentMonth);
    const dailyMap = new Map<string, WorklogEntry[]>();

    // Add all entries to their respective days
    entries.forEach((entry) => {
      const date = new Date(entry.worklog.started);
      const dateKey = date.toISOString().split("T")[0];
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
        const dateKey = current.toISOString().split("T")[0];
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

  // Fetch worklogs for current month
  useEffect(() => {
    let isMounted = true;

    const fetchWorklogs = async () => {
      setLoading(true);
      try {
        const { start, end } = getMonthBounds(currentMonth);
        const entries = await getWorklogs(start, end);

        if (isMounted) {
          const grouped = groupWorklogsByDay(entries);
          setDailyWorklogs(grouped);
          showToast(Toast.Style.Success, `Loaded ${entries.length} worklogs`);
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
  }, [currentMonth]);

  // Calculate total for the month
  const monthTotal = dailyWorklogs.reduce((sum, day) => sum + day.totalSeconds, 0);

  return (
    <List
      isLoading={loading}
      isShowingDetail={showingDetail}
      searchBarPlaceholder="Search worklogs..."
      navigationTitle={`Logged Time - ${formatMonth(currentMonth)}`}
    >
      {dailyWorklogs.length === 0 && !loading ? (
        <List.EmptyView
          title="No worklogs found"
          description={`No time logged in ${formatMonth(currentMonth)}`}
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
      {dailyWorklogs.map((day) => {
        const dayLabel = day.date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
        const subtitle = day.totalSeconds > 0 ? formatDuration(day.totalSeconds) : "No time logged";

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
                        <Action
                          title="Toggle Details"
                          icon={Icon.AppWindowSidebarLeft}
                          onAction={() => setShowingDetail(!showingDetail)}
                        />
                        <Action.CopyToClipboard
                          title="Copy Issue Key"
                          content={entry.issue.key}
                          shortcut={{ modifiers: ["cmd"], key: "c" }}
                        />
                        <Action title="Previous Month" icon={Icon.ArrowLeft} onAction={goToPreviousMonth} />
                        <Action title="Next Month" icon={Icon.ArrowRight} onAction={goToNextMonth} />
                        <Action title="Current Month" icon={Icon.Calendar} onAction={goToCurrentMonth} />
                      </ActionPanel>
                    }
                  />
                ))
              : // Show "Log time" prompt only if below threshold
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
        />
      </List.Section>
    </List>
  );
}

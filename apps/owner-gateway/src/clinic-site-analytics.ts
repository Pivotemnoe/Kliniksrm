export type ClinicAnalyticsEvent = {
  sessionId: string;
  eventName: string;
  section: string | null;
  target: string | null;
  referrerHost: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  deviceType: string | null;
  createdAt: Date;
};

const CONTACT_EVENTS = new Set(['booking_open', 'phone_click', 'chat_open', 'route_click']);
const ACTION_EVENTS = new Set([...CONTACT_EVENTS, 'chat_handoff_open', 'chat_handoff_sent', 'offer_click']);

export function buildClinicSiteAnalyticsSummary(input: {
  events: ClinicAnalyticsEvent[];
  days: number;
  now?: Date;
  truncated?: boolean;
}) {
  const now = input.now ?? new Date();
  const events = [...input.events].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const sessions = new Map<string, ClinicAnalyticsEvent[]>();
  for (const event of events) {
    const current = sessions.get(event.sessionId) ?? [];
    current.push(event);
    sessions.set(event.sessionId, current);
  }

  const actionNames = [
    'booking_open',
    'phone_click',
    'chat_open',
    'chat_handoff_sent',
    'route_click',
    'offer_click',
  ];
  const actions = Object.fromEntries(actionNames.map((name) => [name, summarizeAction(events, name)]));
  const engagedSessions = [...sessions.values()].filter((items) => {
    const sections = new Set(items.filter((event) => event.eventName === 'section_view').map((event) => event.section).filter(Boolean));
    return sections.size >= 2 || items.some((event) => ACTION_EVENTS.has(event.eventName));
  }).length;
  const contactSessions = countSessionsWith(sessions, (event) => CONTACT_EVENTS.has(event.eventName));
  const inquirySessions = countSessionsWith(sessions, (event) => event.eventName === 'chat_handoff_sent');

  return {
    generatedAt: now.toISOString(),
    range: {
      days: input.days,
      from: new Date(now.getTime() - input.days * 86_400_000).toISOString(),
      to: now.toISOString(),
    },
    dataLimited: Boolean(input.truncated),
    privacy: {
      anonymous: true,
      storesIpAddresses: false,
      storesFormContents: false,
    },
    totals: {
      sessions: sessions.size,
      events: events.length,
      engagedSessions,
      contactSessions,
      inquirySessions,
      contactRate: percentage(contactSessions, sessions.size),
    },
    actions,
    funnel: [
      { key: 'visit', sessions: sessions.size },
      { key: 'services', sessions: countSessionsWith(sessions, (event) => event.section === 'services') },
      { key: 'contact', sessions: contactSessions },
      { key: 'inquiry', sessions: inquirySessions },
    ],
    sources: summarizeSessions(sessions, sourceLabel).slice(0, 12),
    sections: summarizeSections(events),
    devices: summarizeSessions(sessions, (items) => items[0]?.deviceType || 'unknown'),
    daily: summarizeDaily(sessions),
    recentSessions: [...sessions.values()]
      .sort((left, right) => last(right).createdAt.getTime() - last(left).createdAt.getTime())
      .slice(0, 30)
      .map((items) => ({
        visitor: `Посетитель ${shortSession(items[0].sessionId)}`,
        startedAt: items[0].createdAt.toISOString(),
        lastSeenAt: last(items).createdAt.toISOString(),
        source: sourceLabel(items),
        deviceType: items[0].deviceType || 'unknown',
        sections: unique(items.filter((event) => event.eventName === 'section_view').map((event) => event.section).filter(isString)),
        actions: unique(items.filter((event) => ACTION_EVENTS.has(event.eventName)).map((event) => event.eventName)),
      })),
  };
}

function summarizeAction(events: ClinicAnalyticsEvent[], eventName: string) {
  const matches = events.filter((event) => event.eventName === eventName);
  return { count: matches.length, sessions: new Set(matches.map((event) => event.sessionId)).size };
}

function countSessionsWith(
  sessions: Map<string, ClinicAnalyticsEvent[]>,
  predicate: (event: ClinicAnalyticsEvent) => boolean,
) {
  return [...sessions.values()].filter((items) => items.some(predicate)).length;
}

function summarizeSessions(
  sessions: Map<string, ClinicAnalyticsEvent[]>,
  selector: (events: ClinicAnalyticsEvent[]) => string,
) {
  const counts = new Map<string, number>();
  for (const items of sessions.values()) {
    const key = selector(items);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, sessionCount]) => ({ label, sessions: sessionCount }))
    .sort((left, right) => right.sessions - left.sessions || left.label.localeCompare(right.label, 'ru'));
}

function summarizeSections(events: ClinicAnalyticsEvent[]) {
  const result = new Map<string, { views: number; sessions: Set<string> }>();
  for (const event of events) {
    if (event.eventName !== 'section_view' || !event.section) continue;
    const current = result.get(event.section) ?? { views: 0, sessions: new Set<string>() };
    current.views += 1;
    current.sessions.add(event.sessionId);
    result.set(event.section, current);
  }
  return [...result.entries()]
    .map(([section, value]) => ({ section, views: value.views, sessions: value.sessions.size }))
    .sort((left, right) => right.sessions - left.sessions || left.section.localeCompare(right.section));
}

function summarizeDaily(sessions: Map<string, ClinicAnalyticsEvent[]>) {
  const result = new Map<string, { sessions: number; contacts: number; inquiries: number }>();
  for (const items of sessions.values()) {
    const date = clinicDateKey(items[0].createdAt);
    const current = result.get(date) ?? { sessions: 0, contacts: 0, inquiries: 0 };
    current.sessions += 1;
    if (items.some((event) => CONTACT_EVENTS.has(event.eventName))) current.contacts += 1;
    if (items.some((event) => event.eventName === 'chat_handoff_sent')) current.inquiries += 1;
    result.set(date, current);
  }
  return [...result.entries()]
    .map(([date, value]) => ({ date, ...value }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function sourceLabel(events: ClinicAnalyticsEvent[]) {
  const firstEvent = events[0];
  if (firstEvent.utmSource) {
    const channel = [firstEvent.utmSource, firstEvent.utmMedium].filter(Boolean).join(' / ');
    return firstEvent.utmCampaign ? `${channel} · ${firstEvent.utmCampaign}` : channel;
  }
  return firstEvent.referrerHost || 'Прямой заход';
}

function clinicDateKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

function shortSession(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'ANON';
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function last<T>(values: T[]) {
  return values[values.length - 1];
}

function isString(value: string | null): value is string {
  return typeof value === 'string' && value.length > 0;
}

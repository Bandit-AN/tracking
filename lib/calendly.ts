const CALENDLY_API_ORIGIN = "https://api.calendly.com";

type CalendlyTracking = {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  salesforce_uuid?: string | null;
};

type CalendlyQuestionAnswer = {
  answer?: string;
  position?: number;
  question?: string;
};

type CalendlyInvitee = {
  email?: string;
  event?: string;
  name?: string;
  questions_and_answers?: CalendlyQuestionAnswer[];
  status?: string;
  text_reminder_number?: string | null;
  timezone?: string;
  tracking?: CalendlyTracking;
  uri?: string;
};

type CalendlyScheduledEvent = {
  end_time?: string;
  event_memberships?: Array<{
    user?: string;
    user_email?: string;
    user_name?: string;
  }>;
  event_type?: string;
  location?: { join_url?: string; location?: string; type?: string } | null;
  name?: string;
  start_time?: string;
  status?: string;
  uri?: string;
};

type CalendlyResource<T> = { resource?: T };

export type CalendlyWebhookPayload = {
  event?: string;
  payload?: CalendlyInvitee;
};

function requireServerEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function assertCalendlyResourceUri(value: string, resource: "invitees" | "scheduled_events") {
  const url = new URL(value);
  if (
    url.origin !== CALENDLY_API_ORIGIN ||
    !url.pathname.includes(`/${resource}/`)
  ) {
    throw new Error(`Invalid Calendly ${resource} URI.`);
  }
  return url.toString();
}

async function fetchCalendlyResource<T>(uri: string, accessToken: string) {
  const response = await fetch(uri, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Calendly API request failed with status ${response.status}.`);
  }

  const body = (await response.json()) as CalendlyResource<T>;
  if (!body.resource) throw new Error("Calendly API returned an empty resource.");
  return body.resource;
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? "";
}

function firstPhone(invitee: CalendlyInvitee) {
  if (invitee.text_reminder_number) return invitee.text_reminder_number;
  return (
    invitee.questions_and_answers?.find((entry) =>
      normalize(entry.question).includes("phone"),
    )?.answer ?? ""
  );
}

function answerFor(invitee: CalendlyInvitee, terms: string[]) {
  return (
    invitee.questions_and_answers?.find((entry) => {
      const question = normalize(entry.question);
      return terms.some((term) => question.includes(term));
    })?.answer ?? ""
  );
}

export function isSelfBooked(invitee: CalendlyInvitee) {
  const tracking = invitee.tracking ?? {};
  return (
    normalize(tracking.utm_source) === "seller_syndicate_funnel" ||
    normalize(tracking.utm_campaign) === "self_booked_lead" ||
    normalize(tracking.utm_content) === "self_booked_lead"
  );
}

export async function processCalendlyBooking(webhook: CalendlyWebhookPayload) {
  if (webhook.event !== "invitee.created") {
    return { ignored: true as const, reason: "unsupported_event" };
  }

  const payload = webhook.payload;
  if (!payload?.uri || !payload.event) {
    throw new Error("Calendly webhook is missing invitee or event URI.");
  }

  const accessToken = requireServerEnv("CALENDLY_ACCESS_TOKEN");
  const expectedEventTypeUri = requireServerEnv("CALENDLY_EVENT_TYPE_URI");
  const sheetsWebhookUrl = requireServerEnv("GOOGLE_SHEETS_BOOKING_WEBHOOK_URL");
  const inviteeUri = assertCalendlyResourceUri(payload.uri, "invitees");
  const eventUri = assertCalendlyResourceUri(payload.event, "scheduled_events");

  // Fetching both resources with our private Calendly token validates that the
  // webhook refers to a real booking and supplies fields omitted from webhooks.
  const [invitee, scheduledEvent] = await Promise.all([
    fetchCalendlyResource<CalendlyInvitee>(inviteeUri, accessToken),
    fetchCalendlyResource<CalendlyScheduledEvent>(eventUri, accessToken),
  ]);

  if (scheduledEvent.event_type !== expectedEventTypeUri) {
    return { ignored: true as const, reason: "different_event_type" };
  }

  if (invitee.status && invitee.status !== "active") {
    return { ignored: true as const, reason: "inactive_invitee" };
  }

  const selfBooked = isSelfBooked(invitee);
  const bookingSource = selfBooked ? "self_booked" : "team_booked";
  const bookingLabel = selfBooked ? "Self booked lead" : "Team booked lead";
  const host = scheduledEvent.event_memberships?.[0];
  const tracking = invitee.tracking ?? {};

  const outboundPayload = {
    type: "booked_call",
    source: "calendly_webhook",
    booking_source: bookingSource,
    booking_label: bookingLabel,
    calendly_invitee_uri: invitee.uri ?? inviteeUri,
    calendly_event_uri: scheduledEvent.uri ?? eventUri,
    calendly_event_type_uri: scheduledEvent.event_type,
    calendly_host: host?.user_name ?? host?.user_email ?? "",
    attribution: {
      utm_source: tracking.utm_source ?? "",
      utm_medium: tracking.utm_medium ?? "",
      utm_campaign: tracking.utm_campaign ?? "",
      utm_content: tracking.utm_content ?? "",
      utm_term: tracking.utm_term ?? "",
      landing_page: selfBooked ? "seller-syndicate-funnel" : "calendly",
    },
    answers: {
      full_name: invitee.name ?? "",
      email: invitee.email ?? "",
      phone: firstPhone(invitee),
      investment_budget: answerFor(invitee, ["budget", "invest"]),
      start_timeline: answerFor(invitee, ["timeline", "start"]),
    },
    cal: {
      uid: invitee.uri ?? inviteeUri,
      invitee: {
        uri: invitee.uri ?? inviteeUri,
        name: invitee.name ?? "",
        email: invitee.email ?? "",
        timezone: invitee.timezone ?? "",
      },
      event: {
        uri: scheduledEvent.uri ?? eventUri,
        event_type: scheduledEvent.event_type ?? "",
        name: scheduledEvent.name ?? "",
        start_time: scheduledEvent.start_time ?? "",
        end_time: scheduledEvent.end_time ?? "",
        location: scheduledEvent.location ?? null,
      },
      startTime: scheduledEvent.start_time ?? "",
      endTime: scheduledEvent.end_time ?? "",
      questions_and_answers: invitee.questions_and_answers ?? [],
    },
  };

  const sheetsResponse = await fetch(sheetsWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(outboundPayload),
    redirect: "follow",
    cache: "no-store",
  });

  if (!sheetsResponse.ok) {
    throw new Error(`Google Sheets webhook failed with status ${sheetsResponse.status}.`);
  }

  return { ignored: false as const, bookingSource };
}

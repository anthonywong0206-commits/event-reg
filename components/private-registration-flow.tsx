"use client";

import { useState } from "react";
import type { EventRecord, RegistrationMethod } from "@/lib/types";
import { InviteCodeGate } from "@/components/invite-code-gate";
import { RegistrationForm } from "@/components/registration-form";

export function PrivateRegistrationFlow({
  event,
  initialMethod,
}: {
  event: EventRecord;
  initialMethod: RegistrationMethod;
}) {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  if (!accessToken) {
    return (
      <InviteCodeGate
        eventSlug={event.slug}
        eventTitle={event.title}
        onVerified={setAccessToken}
      />
    );
  }

  return <RegistrationForm event={event} initialMethod={initialMethod} inviteAccessToken={accessToken} />;
}

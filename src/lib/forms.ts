import type { ContactTopic, Interest } from "../data/site";

export function subscribeBody(
  email: string,
  website: string,
  turnstileToken: string,
  interest: Interest,
) {
  return { email, website, turnstileToken, interest };
}

export function contactBody(input: {
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
  website: string;
  turnstileToken: string;
}) {
  return input;
}

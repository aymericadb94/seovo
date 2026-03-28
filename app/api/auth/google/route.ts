export async function GET() {
  const scopes = [
    "https://www.googleapis.com/auth/webmasters.readonly",
  ].join(" ");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return Response.redirect(url.toString());
}

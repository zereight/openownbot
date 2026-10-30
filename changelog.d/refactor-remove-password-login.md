### Removed

- Remove the password sign-in of a team host (`POST /v1/auth/login`). No client of OpenOwnBot called
  it, and a member signs in with an account. The host now answers a request to that path like any
  unknown route. The password hashes that older versions stored stay in the team file, and nothing reads
  them. A team member who has no account and no email address cannot sign in with a password any more.

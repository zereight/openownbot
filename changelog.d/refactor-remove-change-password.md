### Removed

- Remove the password change of a team host (`POST /v1/auth/password`). No client of OpenOwnBot called
  it, and a member signs in with an account. The host now answers a request to that path with 404.
  The stored password hashes and the password sign-in of a member with no account stay.

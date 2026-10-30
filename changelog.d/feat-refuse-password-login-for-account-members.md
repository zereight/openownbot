### Changed

- Refuse the password sign-in of a team member who has an account. Such a member signs in with the
  account. The answer is the one of a wrong password, and the stored password hash stays in the
  file. Before, a member who signed in with an account could still sign in with the old password and
  the email address. A member from before accounts, with no account, signs in with the password as
  before.

### Changed

- Delete the password hash and salt that older versions stored for a team member who has an account.
  The host does not read them any more. A member without an account keeps them, and so does the copy of the
  imported record. The deletion cannot be undone, and OpenOwnBot makes no backup of the team file.

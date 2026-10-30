import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { avatarFileExtension, isAvatarMimeType, isValidAvatarImage } from "@openownbot/contracts/avatar-images";
import { type HostKeyHandover, hostKeyHandoverStatement } from "@openownbot/contracts/host-key-handover";
import { INPUT_LIMITS } from "@openownbot/contracts/input-limits";
import type {
  AvatarImageInput,
  CentralAuthUser,
  TeamMemberSummary,
  TeamRole,
  TeamSessionSummary,
} from "@openownbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openownbot/contracts/runtime-values";
import { normalizeEmailAddress, slugifyTeamServerName } from "@openownbot/contracts/validation";
import { sourceText } from "@openownbot/i18n/source";
import { Context, Deferred, Effect, Layer, Result, Schema } from "effect";
import {
  isEmptyStoredFile,
  parseStoredJson,
  setAsideDamagedFile,
  type WriteJsonFileOptions,
  writeFileAtomically,
} from "../backend/atomic-json-file";
import { RemoteWorkflowError, remoteCall, remoteDecode } from "./remote-service-effects";

class TeamStoreFiles extends Context.Service<
  TeamStoreFiles,
  {
    readText(path: string): Effect.Effect<string, RemoteWorkflowError>;
    mkdir(path: string): Effect.Effect<void, RemoteWorkflowError>;
    copyExclusive(from: string, to: string): Effect.Effect<void, RemoteWorkflowError>;
    remove(path: string): Effect.Effect<void, RemoteWorkflowError>;
    setAside(path: string): Effect.Effect<void>;
    write(
      path: string,
      content: string | Uint8Array,
      options?: WriteJsonFileOptions,
    ): Effect.Effect<void, RemoteWorkflowError>;
  }
>()("openownbot/main/TeamStoreFiles") {
  static readonly layer = Layer.succeed(
    TeamStoreFiles,
    TeamStoreFiles.of({
      readText: (path) => remoteCall(() => readFile(path, "utf8")),
      mkdir: (path) => remoteCall(() => mkdir(path, { recursive: true, mode: 0o700 })).pipe(Effect.asVoid),
      copyExclusive: (from, to) => remoteCall(() => copyFile(from, to, constants.COPYFILE_EXCL)),
      remove: (path) => remoteCall(() => rm(path, { force: true })),
      setAside: setAsideDamagedFile,
      write: (path, content, options) =>
        writeFileAtomically(path, content, options).pipe(
          Effect.mapError(({ cause }) => new RemoteWorkflowError({ cause })),
        ),
    }),
  );
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

export class TeamStoreError extends Schema.TaggedError<TeamStoreError>()("TeamStoreError", { message: Schema.String }) {
  constructor(message = "") {
    super({ message });
  }
}

interface StoredMember extends TeamMemberSummary {
  accountId?: string;
}

interface StoredInvite {
  id: string;
  tokenHash: string;
  role: Exclude<TeamRole, "owner">;
  expiresAt: string;
  usedAt: string | null;
  email?: string | null;
  // Optional so files written before permanent links still read. Absent means single-use.
  permanent?: boolean;
  useCount?: number;
}

interface StoredSession {
  id: string;
  memberId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

interface StoredTeam {
  version: 1;
  serverId: string;
  serverName: string;
  enabledOnLaunch: boolean;
  publicKey: string;
  privateKey: string;
  serverLogo?:
    | {
        version: string;
        mimeType: AvatarImageInput["mimeType"];
      }
    | undefined;
  members: StoredMember[];
  invites: StoredInvite[];
  sessions: StoredSession[];
  /**
   * A new key that the host signed a handover to, but that the account service has not accepted
   * yet. The host keeps signing with the current key until the account service accepts it.
   */
  pendingKeyRotation?: StoredKeyRotation | undefined;
}

interface StoredKeyRotation {
  publicKey: string;
  privateKey: string;
  handover: HostKeyHandover;
}

/**
 * The file holds one host per OpenOwnBot account, so switching accounts cannot hand the
 * new account the previous one's server. `hosts` is append-only - a host is never
 * removed when its owner signs out, because this file is user data with no backup.
 */
interface StoredTeamFile {
  version: 2;
  /** The account whose host is active, so a restart activates it before the network answers. */
  activeAccountId: string | null;
  hosts: StoredTeam[];
}

export interface TeamIdentity {
  serverId: string;
  serverName: string;
  fingerprint: string;
  publicKey: string;
  enabledOnLaunch: boolean;
  logoVersion: string | null;
}

export interface CreatedInvite {
  id: string;
  role: Exclude<TeamRole, "owner">;
  token: string;
  expiresAt: string;
  email: string | null;
  permanent: boolean;
  useCount: number;
}

export interface TeamInvitePreview {
  role: Exclude<TeamRole, "owner">;
  expiresAt: string;
  emailBound: boolean;
  permanent: boolean;
}

export interface AuthenticatedMember {
  member: TeamMemberSummary;
  sessionToken: string;
  sessionExpiresAt: string;
}

export interface RemoteDirectoryMember {
  membershipId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: TeamRole;
  status: "active" | "revoked";
  createdAt: number;
}

export class TeamStore {
  readonly #path: string;
  /** Read once and never written: the file a build without this envelope still owns. */
  readonly #logoRoot: string;
  #file: StoredTeamFile = { version: 2, activeAccountId: null, hosts: [] };
  /** The host of the signed-in account. Every other method reads this one, never `#file.hosts`. */
  #state: StoredTeam | null = null;
  readonly #remoteSessions = new Map<
    string,
    { member: TeamMemberSummary; sessionId: string; createdAt: string; sessionExpiresAt: string }
  >();
  #writeChain: Deferred.Deferred<void> | null = null;
  /**
   * The file exists but is neither a v2 envelope nor a v1 record - a file a newer build
   * wrote, or a damaged one. `#file` is empty only because something else owns this path,
   * so writing would destroy the user's only copy. Nothing here is backed up.
   */
  #unreadableFile = false;

  constructor(path: string) {
    this.#path = path;
    this.#logoRoot = join(dirname(path), `${basename(path)}.assets`, "logo");
  }

  readonly initialize = Effect.fn("TeamStore.initialize")(
    function* (this: TeamStore): Effect.fn.Return<void, RemoteWorkflowError, TeamStoreFiles> {
      const attempt0 = yield* Effect.gen({ self: this }, function* () {
        const contents = yield* TeamStoreFiles.use((files) => files.readText(this.#path));
        // A power loss left the file without content. It holds no host to keep, so the start
        // continues as if the file were missing.
        if (isEmptyStoredFile(contents)) return yield* TeamStoreFiles.use((files) => files.setAside(this.#path));
        const parsed = yield* remoteDecode(() =>
          parseStoredJson(this.#path, contents, (value) => (isStoredTeamFile(value) ? value : null)),
        );
        if (isStoredTeamFile(parsed)) this.#file = parsed;
        else this.#unreadableFile = true;
      }).pipe(Effect.result);
      if (Result.isFailure(attempt0)) {
        const error = attempt0.failure.cause;
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
          return yield* new RemoteWorkflowError({ cause: error });
      }
      const activeAccountId = this.#file.activeAccountId;
      this.#state =
        activeAccountId === null
          ? null
          : (this.#file.hosts.find((host) => ownerAccountId(host) === activeAccountId) ?? null);
      if (this.#state) yield* this.#pruneEffect();
    },
    Effect.provide(TeamStoreFiles.layer),
    Effect.uninterruptible,
  ).bind(this);

  /**
   * Binds the store to `user`'s own host. An account with no host leaves the store unconfigured
   * rather than borrowing another account's.
   */

  readonly activateAccount = Effect.fn("TeamStore.activateAccount")(
    function* (this: TeamStore, user: CentralAuthUser): Effect.fn.Return<void, RemoteWorkflowError, TeamStoreFiles> {
      yield* remoteDecode(() => normalizeEmail(user.email));
      // Everything below mutates in memory and is committed by the single write at the end,
      // so a failed write can put the whole file back rather than leave half a switch applied
      // with the status naming one account and every write going to another.
      const rollback = structuredClone(this.#file);
      this.#state = this.#file.hosts.find((host) => ownerAccountId(host) === user.id) ?? null;
      this.#file.activeAccountId = user.id;
      if (this.#state) {
        yield* remoteDecode(() => this.#applyAccount(user));
        this.#dropExpired(this.#state);
      }
      return yield* Effect.gen({ self: this }, function* () {
        yield* this.#recordActiveAccountEffect();
      }).pipe(
        Effect.catch(({ cause: error }) =>
          Effect.gen({ self: this }, function* () {
            // The file keeps what it had, so nothing is lost. Memory does not go back to the
            // previous account, though: central authentication has already moved on, and leaving
            // its host answerable is the failure this whole change exists to prevent. Unbound
            // until an auth event or a restart records the switch.
            this.#file = rollback;
            this.#state = null;
            return yield* new RemoteWorkflowError({ cause: error });
          }),
        ),
      );
    },
    Effect.provide(TeamStoreFiles.layer),
    Effect.uninterruptible,
  ).bind(this);

  /**
   * Stops answering for the active host without touching the file. The renderer learns about
   * a new account before the awaited teardown that follows can finish, so there has to be a
   * way to stop serving the previous one immediately; `activateAccount` records the switch.
   */
  unbindActiveHost(): void {
    this.#state = null;
  }

  /** Signing out unbinds the host without removing it - signing back in restores it. */

  readonly deactivate = Effect.fn("TeamStore.deactivate")(
    function* (this: TeamStore): Effect.fn.Return<void, RemoteWorkflowError, TeamStoreFiles> {
      const previousState = this.#state;
      const previousAccountId = this.#file.activeAccountId;
      this.#state = null;
      this.#file.activeAccountId = null;
      return yield* Effect.gen({ self: this }, function* () {
        yield* this.#recordActiveAccountEffect();
      }).pipe(
        Effect.catch(({ cause: error }) =>
          Effect.gen({ self: this }, function* () {
            this.#state = previousState;
            this.#file.activeAccountId = previousAccountId;
            return yield* new RemoteWorkflowError({ cause: error });
          }),
        ),
      );
    },
    Effect.provide(TeamStoreFiles.layer),
    Effect.uninterruptible,
  ).bind(this);

  /**
   * A file with no host records nothing an activation could change, so there is nothing to
   * write - which is also what keeps signing in from failing, or from overwriting a file
   * this store could not read. Configuring a server still refuses that file outright.
   */
  readonly #recordActiveAccountEffect = Effect.fn("TeamStore.recordActiveAccount")(function* (
    this: TeamStore,
  ): Effect.fn.Return<void, RemoteWorkflowError, TeamStoreFiles> {
    if (this.#file.hosts.length === 0) return;
    yield* this.#persistFileEffect();
  });

  get configured(): boolean {
    return this.#state !== null;
  }

  getIdentity(): TeamIdentity | null {
    return this.#state ? identityOf(this.#state) : null;
  }

  getOwnerEmail(): string | null {
    return this.#state?.members.find((member) => member.role === "owner")?.email ?? null;
  }

  getOwnerMemberId(): string | null {
    return this.#state?.members.find((member) => member.role === "owner")?.id ?? null;
  }

  assertOwnerAccount(user: CentralAuthUser): void {
    const owner = this.#state?.members.find((member) => member.role === "owner");
    if (!owner?.email) {
      throw new TeamStoreError(sourceText("error.team.ownerNotLinked"));
    }
    // The account is the identity once one is recorded; the address is only what an owner
    // from before accounts can be recognized by, and it can change hands.
    const matches = owner.accountId
      ? owner.accountId === user.id
      : normalizeEmail(user.email) === normalizeEmail(owner.email);
    if (!matches) {
      throw new TeamStoreError(sourceText("error.team.ownerEmailRequired"));
    }
  }

  getIdentityProof(challenge: string): (TeamIdentity & { challenge: string; signature: string }) | null {
    const identity = this.getIdentity();
    if (!identity || !this.#state || !/^[A-Za-z0-9_-]{16,128}$/.test(challenge)) return null;
    const signature = sign(null, Buffer.from(challenge), this.#state.privateKey).toString("base64url");
    return { ...identity, challenge, signature };
  }

  signRemoteAuthentication(transcript: string): string {
    if (!this.#state) throw new TeamStoreError(sourceText("error.team.hostNotConfigured"));
    return sign(null, Buffer.from(transcript), this.#state.privateKey).toString("base64url");
  }

  readonly configureWithAccount = Effect.fn("TeamStore.configureWithAccount")(
    function* (
      this: TeamStore,
      serverName: string,
      user: CentralAuthUser,
      logo?: AvatarImageInput | null,
      options: { serverId?: string } = {},
    ): Effect.fn.Return<TeamIdentity, RemoteWorkflowError, TeamStoreFiles> {
      const email = yield* remoteDecode(() => normalizeEmail(user.email));
      yield* remoteDecode(() => this.#assertNoHostFor(user.id));
      yield* remoteDecode(() => validateServerName(serverName));
      // Both `activateAccount` and `deactivate` set this synchronously, so comparing it
      // after the awaits below is a reliable answer to "is this still the account that
      // asked?" - a configuration finishing under someone else's session would otherwise
      // rebind the store to the account that has just signed out.
      const activeAccountBefore = this.#file.activeAccountId;
      const { publicKey, privateKey } = yield* remoteDecode(() =>
        generateKeyPairSync("ed25519", {
          publicKeyEncoding: { type: "spki", format: "pem" },
          privateKeyEncoding: { type: "pkcs8", format: "pem" },
        }),
      );
      const serverLogo = logo ? yield* this.#writeLogoEffect(logo) : undefined;
      const attempt5 = yield* Effect.gen({ self: this }, function* () {
        // `#writeLogo` yields, so two concurrent requests could both have passed the guard
        // above. Re-checking is what stops one account owning two stored hosts, where a
        // restart would activate the one the status never showed.
        yield* remoteDecode(() => this.#assertNoHostFor(user.id));
        if (this.#file.activeAccountId !== activeAccountBefore) {
          return yield* new RemoteWorkflowError({
            cause: new TeamStoreError(sourceText("error.team.accountChangedDuringCreate")),
          });
        }
      }).pipe(Effect.result);
      if (Result.isFailure(attempt5)) {
        const error = attempt5.failure.cause;
        if (serverLogo) yield* this.#removeLogoEffect(serverLogo).pipe(Effect.catch(() => Effect.void));
        return yield* new RemoteWorkflowError({ cause: error });
      }
      const created: StoredTeam = {
        version: 1,
        serverId: options.serverId ?? randomUUID(),
        serverName: serverName.trim(),
        enabledOnLaunch: false,
        publicKey,
        privateKey,
        ...(serverLogo ? { serverLogo } : {}),
        members: [
          {
            id: randomUUID(),
            accountId: user.id,
            username: email,
            email,
            name: yield* remoteDecode(() => normalizeName(user.name)),
            avatarUrl: yield* remoteDecode(() => normalizeAvatarUrl(user.avatarUrl)),
            role: "owner",
            disabled: false,
            createdAt: new Date().toISOString(),
          },
        ],
        invites: [],
        sessions: [],
      };
      this.#file.hosts.push(created);
      const previousState = this.#state;
      const previousAccountId = this.#file.activeAccountId;
      this.#state = created;
      this.#file.activeAccountId = user.id;
      const attempt4 = yield* Effect.gen({ self: this }, function* () {
        yield* this.#persistFileEffect();
      }).pipe(Effect.result);
      if (Result.isFailure(attempt4)) {
        const error = attempt4.failure.cause;
        this.#file.hosts = this.#file.hosts.filter((host) => host !== created);
        if (this.#state === created) {
          this.#state = previousState;
          this.#file.activeAccountId = previousAccountId;
        }
        if (serverLogo) yield* this.#removeLogoEffect(serverLogo).pipe(Effect.catch(() => Effect.void));
        return yield* new RemoteWorkflowError({ cause: error });
      }
      // Writing the file yields as well. The host stays - it is on disk and it belongs to the
      // account that asked for it - but the caller must not go on to apply this configuration,
      // its logo and its remote registration, to whichever host is active now.
      if (this.#state !== created) {
        return yield* new RemoteWorkflowError({
          cause: new TeamStoreError(sourceText("error.team.accountChangedDuringCreate")),
        });
      }
      return identityOf(created);
    },
    Effect.provide(TeamStoreFiles.layer),
    Effect.uninterruptible,
  ).bind(this);

  readonly updateIdentity = Effect.fn("TeamStore.updateIdentity")(
    function* (
      this: TeamStore,
      input: { serverName?: string; logo?: AvatarImageInput | null },
    ): Effect.fn.Return<TeamIdentity, RemoteWorkflowError, TeamStoreFiles> {
      const state = yield* remoteDecode(() => this.#requireState());
      const serverName = input.serverName;
      if (serverName !== undefined) yield* remoteDecode(() => validateServerName(serverName));
      if (input.serverName === undefined && input.logo === undefined) {
        const identity = this.getIdentity();
        if (!identity)
          return yield* new RemoteWorkflowError({ cause: new TeamStoreError(sourceText("error.team.notConfigured")) });
        return identity;
      }

      const previousName = state.serverName;
      const previousLogo = state.serverLogo;
      const nextLogo =
        input.logo === undefined
          ? previousLogo
          : input.logo === null
            ? undefined
            : yield* this.#writeLogoEffect(input.logo);
      // Writing the logo can outlive this host. `#persist` only requires *some* active host, so
      // without this the name and image asked for here would land on whichever host became
      // active meanwhile - and the caller would be handed that other account's identity back.
      if (this.#state !== state) {
        if (nextLogo && nextLogo.version !== previousLogo?.version) {
          yield* this.#removeLogoEffect(nextLogo).pipe(Effect.catch(() => Effect.void));
        }
        return yield* new RemoteWorkflowError({ cause: new TeamStoreError(sourceText("error.team.serverNotActive")) });
      }
      if (input.serverName !== undefined) state.serverName = input.serverName.trim();
      if (nextLogo === undefined) delete state.serverLogo;
      else state.serverLogo = nextLogo;
      const attempt6 = yield* Effect.gen({ self: this }, function* () {
        yield* this.#persistEffect();
      }).pipe(Effect.result);
      if (Result.isFailure(attempt6)) {
        const error = attempt6.failure.cause;
        state.serverName = previousName;
        if (previousLogo === undefined) delete state.serverLogo;
        else state.serverLogo = previousLogo;
        if (nextLogo && nextLogo.version !== previousLogo?.version) {
          yield* this.#removeLogoEffect(nextLogo).pipe(Effect.catch(() => Effect.void));
        }
        return yield* new RemoteWorkflowError({ cause: error });
      }
      if (previousLogo && previousLogo.version !== nextLogo?.version) {
        yield* this.#removeLogoEffect(previousLogo).pipe(Effect.catch(() => Effect.void));
      }
      // Writing the file yields as well. The change is on disk and belongs to the account that
      // asked for it, but the caller must not go on to push it to the remote host under the
      // authentication - and the owner membership - of whichever account is active now.
      if (this.#state !== state) {
        return yield* new RemoteWorkflowError({ cause: new TeamStoreError(sourceText("error.team.serverNotActive")) });
      }
      return identityOf(state);
    },
    Effect.provide(TeamStoreFiles.layer),
    Effect.uninterruptible,
  ).bind(this);

  /** The handover that the account service has not accepted yet, so a restart can send it again. */
  getPendingKeyHandover(): HostKeyHandover | null {
    return this.#state?.pendingKeyRotation?.handover ?? null;
  }

  /**
   * Makes a new key and a handover that the current key and the new key both sign. The current
   * key stays in use until `completeKeyRotation`. A rotation that is already pending is returned
   * again, so a second request cannot make a second key.
   */
  readonly beginKeyRotation = Effect.fn("TeamStore.beginKeyRotation")(
    function* (this: TeamStore): Effect.fn.Return<HostKeyHandover, RemoteWorkflowError, TeamStoreFiles> {
      const state = yield* remoteDecode(() => this.#requireState());
      if (state.pendingKeyRotation) return state.pendingKeyRotation.handover;
      const { publicKey, privateKey } = yield* remoteDecode(() =>
        generateKeyPairSync("ed25519", {
          publicKeyEncoding: { type: "spki", format: "pem" },
          privateKeyEncoding: { type: "pkcs8", format: "pem" },
        }),
      );
      const statement = {
        hostId: state.serverId,
        issuedAt: Date.now(),
        previousPublicKey: state.publicKey,
        publicKey,
      };
      const message = Buffer.from(hostKeyHandoverStatement(statement));
      const handover: HostKeyHandover = {
        ...statement,
        previousSignature: sign(null, message, state.privateKey).toString("base64url"),
        signature: sign(null, message, privateKey).toString("base64url"),
      };
      state.pendingKeyRotation = { publicKey, privateKey, handover };
      const attempt = yield* this.#persistStateEffect(state).pipe(Effect.result);
      if (Result.isFailure(attempt)) {
        delete state.pendingKeyRotation;
        return yield* attempt.failure;
      }
      return handover;
    },
    Effect.provide(TeamStoreFiles.layer),
    Effect.uninterruptible,
  ).bind(this);

  /** Uses the new key after the account service accepted `handover`. The previous key is deleted. */
  readonly completeKeyRotation = Effect.fn("TeamStore.completeKeyRotation")(
    function* (
      this: TeamStore,
      handover: HostKeyHandover,
    ): Effect.fn.Return<TeamIdentity, RemoteWorkflowError, TeamStoreFiles> {
      const state = yield* remoteDecode(() => this.#requireState());
      const pending = state.pendingKeyRotation;
      if (!pending || pending.handover.publicKey !== handover.publicKey)
        return yield* new RemoteWorkflowError({
          cause: new TeamStoreError(sourceText("error.team.keyRotationMissing")),
        });
      const previous = { publicKey: state.publicKey, privateKey: state.privateKey };
      state.publicKey = pending.publicKey;
      state.privateKey = pending.privateKey;
      delete state.pendingKeyRotation;
      const attempt = yield* this.#persistStateEffect(state).pipe(Effect.result);
      if (Result.isFailure(attempt)) {
        state.publicKey = previous.publicKey;
        state.privateKey = previous.privateKey;
        state.pendingKeyRotation = pending;
        return yield* attempt.failure;
      }
      return identityOf(state);
    },
    Effect.provide(TeamStoreFiles.layer),
    Effect.uninterruptible,
  ).bind(this);

  /** Deletes a rotation that the account service refused. The current key stays in use. */
  readonly discardKeyRotation = Effect.fn("TeamStore.discardKeyRotation")(
    function* (
      this: TeamStore,
      handover: HostKeyHandover,
    ): Effect.fn.Return<void, RemoteWorkflowError, TeamStoreFiles> {
      const state = yield* remoteDecode(() => this.#requireState());
      const pending = state.pendingKeyRotation;
      if (!pending || pending.handover.publicKey !== handover.publicKey) return;
      delete state.pendingKeyRotation;
      const attempt = yield* this.#persistStateEffect(state).pipe(Effect.result);
      if (Result.isFailure(attempt)) {
        state.pendingKeyRotation = pending;
        return yield* attempt.failure;
      }
    },
    Effect.provide(TeamStoreFiles.layer),
    Effect.uninterruptible,
  ).bind(this);

  /** Writes the file only while `state` is still the active host. */
  readonly #persistStateEffect = Effect.fn("TeamStore.persistState")(function* (
    this: TeamStore,
    state: StoredTeam,
  ): Effect.fn.Return<void, RemoteWorkflowError, TeamStoreFiles> {
    if (this.#state !== state)
      return yield* new RemoteWorkflowError({ cause: new TeamStoreError(sourceText("error.team.serverNotActive")) });
    yield* this.#persistFileEffect();
  });

  resolveLogo(): { path: string; mimeType: AvatarImageInput["mimeType"]; version: string } | null {
    const logo = this.#state?.serverLogo;
    if (!logo) return null;
    return {
      path: join(this.#logoRoot, `${logo.version}.${avatarFileExtension(logo.mimeType)}`),
      mimeType: logo.mimeType,
      version: logo.version,
    };
  }

  readonly #writeLogoEffect = Effect.fn("TeamStore.writeLogo")(function* (
    this: TeamStore,
    image: AvatarImageInput,
  ): Effect.fn.Return<NonNullable<StoredTeam["serverLogo"]>, RemoteWorkflowError, TeamStoreFiles> {
    if (!isValidAvatarImage(image.mimeType, image.bytes)) {
      return yield* new RemoteWorkflowError({ cause: new TeamStoreError(sourceText("error.team.logoInvalid")) });
    }
    const version = randomUUID();
    const target = join(this.#logoRoot, `${version}.${avatarFileExtension(image.mimeType)}`);
    yield* TeamStoreFiles.use((files) => files.write(target, image.bytes, { createDirectory: true }));
    return { version, mimeType: image.mimeType };
  });

  readonly #removeLogoEffect = Effect.fn("TeamStore.removeLogo")(function* (
    this: TeamStore,
    logo: NonNullable<StoredTeam["serverLogo"]>,
  ) {
    yield* TeamStoreFiles.use((files) =>
      files.remove(join(this.#logoRoot, `${logo.version}.${avatarFileExtension(logo.mimeType)}`)),
    );
  });

  /**
   * `serverId` names the host the caller decided this for. Publishing and unpublishing
   * both span awaits an account switch can land in, and the launch preference of one
   * account's host must never be written onto another's.
   */

  readonly setEnabledOnLaunch = Effect.fn("TeamStore.setEnabledOnLaunch")(
    function* (
      this: TeamStore,
      serverId: string,
      enabled: boolean,
    ): Effect.fn.Return<void, RemoteWorkflowError, TeamStoreFiles> {
      const state = yield* remoteDecode(() => this.#requireState());
      if (state.serverId !== serverId) {
        return yield* new RemoteWorkflowError({ cause: new TeamStoreError(sourceText("error.team.serverNotActive")) });
      }
      state.enabledOnLaunch = enabled;
      yield* this.#persistEffect();
    },
    Effect.provide(TeamStoreFiles.layer),
    Effect.uninterruptible,
  ).bind(this);

  listMembers(): TeamMemberSummary[] {
    const members = this.#requireState().members.map(publicMember);
    const known = new Set(members.map((member) => member.id));
    for (const remote of this.#remoteSessions.values()) {
      if (!known.has(remote.member.id) && Date.parse(remote.sessionExpiresAt) > Date.now()) {
        members.push(structuredClone(remote.member));
        known.add(remote.member.id);
      }
    }
    return members;
  }

  /**
   * `serverId` names the host the caller loaded this directory for. Signing into another
   * account swaps the active host, so a directory that was already in flight would
   * otherwise rewrite the new account's owner membership and disable its members.
   *
   * The directory is the authority for live sessions too: a session whose membership is gone,
   * disabled or has another role closes here, and the ids come back so the caller can close the
   * connections. The account service has already ended those sessions.
   */

  readonly syncRemoteDirectory = Effect.fn("TeamStore.syncRemoteDirectory")(
    function* (
      this: TeamStore,
      serverId: string,
      remoteMembers: RemoteDirectoryMember[],
    ): Effect.fn.Return<string[], RemoteWorkflowError, TeamStoreFiles> {
      const state = yield* remoteDecode(() => this.#requireState());
      if (state.serverId !== serverId) {
        return yield* new RemoteWorkflowError({ cause: new TeamStoreError(sourceText("error.team.serverNotActive")) });
      }
      const remoteOwner = remoteMembers.find((member) => member.role === "owner");
      const localOwner = state.members.find((member) => member.role === "owner");
      if (remoteOwner && localOwner && remoteOwner.membershipId !== localOwner.id) {
        if (state.members.some((member) => member.id === remoteOwner.membershipId)) {
          return yield* new RemoteWorkflowError({
            cause: new TeamStoreError(sourceText("error.team.ownerMembershipConflict")),
          });
        }
        const previousOwnerId = localOwner.id;
        localOwner.id = remoteOwner.membershipId;
        for (const session of state.sessions) {
          if (session.memberId === previousOwnerId) session.memberId = remoteOwner.membershipId;
        }
      }
      const remoteIds = new Set(remoteMembers.map((member) => member.membershipId));
      for (const remote of remoteMembers) {
        const member = state.members.find((candidate) => candidate.id === remote.membershipId);
        if (!member) {
          if (remote.role === "owner")
            return yield* new RemoteWorkflowError({
              cause: new TeamStoreError(sourceText("error.team.ownerIdentityMismatch")),
            });
          state.members.push({
            id: remote.membershipId,
            username: yield* remoteDecode(() => normalizeEmail(remote.email)),
            email: yield* remoteDecode(() => normalizeEmail(remote.email)),
            name: yield* remoteDecode(() => normalizeName(remote.name)),
            avatarUrl: yield* remoteDecode(() => normalizeAvatarUrl(remote.avatarUrl)),
            role: remote.role,
            disabled: remote.status !== "active",
            createdAt: new Date(remote.createdAt).toISOString(),
          });
          continue;
        }
        member.username = yield* remoteDecode(() => normalizeEmail(remote.email));
        member.email = yield* remoteDecode(() => normalizeEmail(remote.email));
        member.name = yield* remoteDecode(() => normalizeName(remote.name));
        member.avatarUrl = yield* remoteDecode(() => normalizeAvatarUrl(remote.avatarUrl));
        member.role = remote.role;
        member.disabled = remote.status !== "active";
      }
      for (const member of state.members) {
        if (member.role !== "owner" && !remoteIds.has(member.id)) member.disabled = true;
      }
      const activeRoles = new Map(
        remoteMembers
          .filter((member) => member.status === "active")
          .map((member) => [member.membershipId, member.role]),
      );
      const closed: string[] = [];
      for (const [tokenHash, session] of this.#remoteSessions) {
        if (activeRoles.get(session.member.id) === session.member.role) continue;
        this.#remoteSessions.delete(tokenHash);
        closed.push(session.sessionId);
      }
      yield* this.#persistEffect();
      return closed;
    },
    Effect.provide(TeamStoreFiles.layer),
    Effect.uninterruptible,
  ).bind(this);

  openRemoteSession(input: {
    sessionId: string;
    membershipId: string;
    userId: string;
    role: TeamRole;
    expiresAt?: number;
  }): AuthenticatedMember {
    const sessionToken = randomBytes(32).toString("base64url");
    const sessionExpiresAt = new Date(input.expiresAt ?? Date.now() + SESSION_TTL_MS).toISOString();
    const stored = this.#requireState().members.find((member) => member.id === input.membershipId);
    const member: TeamMemberSummary = stored
      ? { ...publicMember(stored), role: input.role, disabled: false }
      : {
          id: input.membershipId,
          username: input.userId,
          email: null,
          name: null,
          role: input.role,
          createdAt: new Date().toISOString(),
          disabled: false,
        };
    this.#remoteSessions.set(hashToken(sessionToken), {
      member,
      sessionId: input.sessionId,
      createdAt: new Date().toISOString(),
      sessionExpiresAt,
    });
    return { member: structuredClone(member), sessionToken, sessionExpiresAt };
  }

  closeRemoteSession(sessionId: string): void {
    for (const [tokenHash, session] of this.#remoteSessions) {
      if (session.sessionId === sessionId) this.#remoteSessions.delete(tokenHash);
    }
  }

  getMember(memberId: string): TeamMemberSummary | null {
    const member = this.#state?.members.find((candidate) => candidate.id === memberId);
    return member ? publicMember(member) : null;
  }

  listSessions(): TeamSessionSummary[] {
    const state = this.#requireState();
    const persisted = state.sessions.map((session) => ({
      id: session.id,
      memberId: session.memberId,
      username: state.members.find((member) => member.id === session.memberId)?.username ?? "unknown",
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    }));
    const now = Date.now();
    const remote: TeamSessionSummary[] = [];
    for (const [tokenHash, session] of this.#remoteSessions) {
      if (Date.parse(session.sessionExpiresAt) <= now) {
        this.#remoteSessions.delete(tokenHash);
        continue;
      }
      remote.push({
        id: session.sessionId,
        memberId: session.member.id,
        username: session.member.username,
        createdAt: session.createdAt,
        expiresAt: session.sessionExpiresAt,
      });
    }
    return [...persisted, ...remote];
  }

  readonly loginWithAccount = Effect.fn("TeamStore.loginWithAccount")(
    function* (
      this: TeamStore,
      user: CentralAuthUser,
    ): Effect.fn.Return<AuthenticatedMember, RemoteWorkflowError, TeamStoreFiles> {
      const state = yield* remoteDecode(() => this.#requireState());
      const email = yield* remoteDecode(() => normalizeEmail(user.email));
      const member = state.members.find(
        (candidate) => (candidate.email === email || candidate.username === email) && !candidate.disabled,
      );
      if (!member)
        return yield* new RemoteWorkflowError({ cause: new TeamStoreError(sourceText("error.team.accountNotMember")) });
      member.email = email;
      member.accountId = user.id;
      member.username = email;
      member.name = yield* remoteDecode(() => normalizeName(user.name));
      member.avatarUrl = yield* remoteDecode(() => normalizeAvatarUrl(user.avatarUrl));
      const result = yield* remoteDecode(() => this.#createSession(member));
      yield* this.#persistEffect();
      return result;
    },
    Effect.provide(TeamStoreFiles.layer),
    Effect.uninterruptible,
  ).bind(this);

  authenticate(token: string): TeamMemberSummary | null {
    return this.authenticateSession(token)?.member ?? null;
  }

  authenticateSession(
    token: string,
  ): { member: TeamMemberSummary; sessionId: string; sessionExpiresAt: string } | null {
    if (!this.#state || !token) return null;
    const tokenHash = hashToken(token);
    const remote = this.#remoteSessions.get(tokenHash);
    if (remote) {
      if (Date.parse(remote.sessionExpiresAt) > Date.now()) return structuredClone(remote);
      this.#remoteSessions.delete(tokenHash);
    }
    const session = this.#state.sessions.find(
      (candidate) => Date.parse(candidate.expiresAt) > Date.now() && safeTextEqual(candidate.tokenHash, tokenHash),
    );
    if (!session) return null;
    const member = this.#state.members.find((candidate) => candidate.id === session.memberId && !candidate.disabled);
    return member ? { member: publicMember(member), sessionId: session.id, sessionExpiresAt: session.expiresAt } : null;
  }

  readonly logout = Effect.fn("TeamStore.logout")(
    function* (this: TeamStore, token: string): Effect.fn.Return<void, RemoteWorkflowError, TeamStoreFiles> {
      const state = yield* remoteDecode(() => this.#requireState());
      const tokenHash = hashToken(token);
      state.sessions = state.sessions.filter((candidate) => !safeTextEqual(candidate.tokenHash, tokenHash));
      yield* this.#persistEffect();
    },
    Effect.provide(TeamStoreFiles.layer),
    Effect.uninterruptible,
  ).bind(this);

  readonly revokeSession = Effect.fn("TeamStore.revokeSession")(
    function* (this: TeamStore, sessionId: string): Effect.fn.Return<void, RemoteWorkflowError, TeamStoreFiles> {
      const state = yield* remoteDecode(() => this.#requireState());
      state.sessions = state.sessions.filter((session) => session.id !== sessionId);
      this.closeRemoteSession(sessionId);
      yield* this.#persistEffect();
    },
    Effect.provide(TeamStoreFiles.layer),
    Effect.uninterruptible,
  ).bind(this);

  readonly syncAccount = Effect.fn("TeamStore.syncAccount")(
    function* (this: TeamStore, user: CentralAuthUser): Effect.fn.Return<boolean, RemoteWorkflowError, TeamStoreFiles> {
      yield* remoteDecode(() => this.#requireState());
      if (!(yield* remoteDecode(() => this.#applyAccount(user)))) return false;
      yield* this.#persistEffect();
      return true;
    },
    Effect.provide(TeamStoreFiles.layer),
    Effect.uninterruptible,
  ).bind(this);

  /** The profile half of `syncAccount`, without its write. Reports whether anything moved. */
  #applyAccount(user: CentralAuthUser): boolean {
    const state = this.#requireState();
    const email = normalizeEmail(user.email);
    // By account first, so changing the address on an account keeps it matched to its own
    // member rather than locking it out of the host it owns.
    const member =
      state.members.find((candidate) => candidate.accountId === user.id) ??
      state.members.find((candidate) => candidate.email === email || candidate.username === email);
    if (!member) return false;
    const name = normalizeName(user.name);
    const avatarUrl = normalizeAvatarUrl(user.avatarUrl);
    if (
      member.email === email &&
      member.accountId === user.id &&
      member.username === email &&
      member.name === name &&
      (member.avatarUrl ?? null) === avatarUrl
    ) {
      return false;
    }
    member.email = email;
    member.accountId = user.id;
    member.username = email;
    member.name = name;
    member.avatarUrl = avatarUrl;
    return true;
  }

  #createSession(member: StoredMember): AuthenticatedMember {
    const state = this.#requireState();
    const memberSessions = state.sessions
      .filter((session) => session.memberId === member.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const excess = memberSessions.length - INPUT_LIMITS.sessionsPerMember + 1;
    if (excess > 0) {
      const removedIds = new Set(memberSessions.slice(0, excess).map((session) => session.id));
      state.sessions = state.sessions.filter((session) => !removedIds.has(session.id));
    }
    const sessionToken = randomBytes(32).toString("base64url");
    const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    state.sessions.push({
      id: randomUUID(),
      memberId: member.id,
      tokenHash: hashToken(sessionToken),
      expiresAt: sessionExpiresAt,
      createdAt: new Date().toISOString(),
    });
    return { member: publicMember(member), sessionToken, sessionExpiresAt };
  }

  #requireState(): StoredTeam {
    if (!this.#state) throw new TeamStoreError(sourceText("error.team.serverNotConfigured"));
    return this.#state;
  }

  /** Rejects a second host for one account. */
  #assertNoHostFor(accountId: string): void {
    if (this.#file.hosts.some((host) => ownerAccountId(host) === accountId)) {
      throw new TeamStoreError(sourceText("error.team.alreadyConfigured"));
    }
  }

  readonly #pruneEffect = Effect.fn("TeamStore.prune")(function* (
    this: TeamStore,
  ): Effect.fn.Return<void, RemoteWorkflowError, TeamStoreFiles> {
    if (!this.#state) return;
    this.#dropExpired(this.#state);
    yield* this.#persistEffect();
  });

  /** The expiry half of `#prune`, without its write. */
  #dropExpired(host: StoredTeam): void {
    const now = Date.now();
    host.sessions = host.sessions.filter((session) => Date.parse(session.expiresAt) > now);
    host.invites = host.invites.filter((invite) => invite.usedAt !== null || Date.parse(invite.expiresAt) > now);
  }

  readonly #persistEffect = Effect.fn("TeamStore.persist")(function* (
    this: TeamStore,
  ): Effect.fn.Return<void, RemoteWorkflowError, TeamStoreFiles> {
    yield* remoteDecode(() => this.#requireState());
    yield* this.#persistFileEffect();
  });

  readonly #persistFileEffect = Effect.fn("TeamStore.persistFile")(function* (
    this: TeamStore,
  ): Effect.fn.Return<void, RemoteWorkflowError, TeamStoreFiles> {
    if (this.#unreadableFile) {
      return yield* new RemoteWorkflowError({
        cause: new TeamStoreError(sourceText("error.team.serverFileUnreadable")),
      });
    }
    const snapshot = structuredClone(this.#file);
    const previous = this.#writeChain;
    const pending = Deferred.makeUnsafe<void>();
    this.#writeChain = pending;
    yield* Effect.gen({ self: this }, function* () {
      if (previous) yield* Deferred.await(previous);
      const content = yield* remoteDecode(() => `${JSON.stringify(snapshot)}\n`);
      yield* TeamStoreFiles.use((files) => files.write(this.#path, content));
    }).pipe(
      Effect.ensuring(
        Effect.gen({ self: this }, function* () {
          if (this.#writeChain === pending) this.#writeChain = null;
          yield* Deferred.succeed(pending, undefined);
        }),
      ),
    );
  });
}

export function fingerprint(publicKey: string): string {
  return createHash("sha256").update(publicKey).digest("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function safeTextEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function publicMember(member: StoredMember): TeamMemberSummary {
  return {
    id: member.id,
    username: member.username,
    email: member.email ?? null,
    name: member.name ?? null,
    avatarUrl: member.avatarUrl ?? null,
    role: member.role,
    createdAt: member.createdAt,
    disabled: member.disabled,
  };
}

function normalizeEmail(value: string): string {
  const normalized = normalizeEmailAddress(value);
  if (!normalized) throw new TeamStoreError(sourceText("error.team.emailInvalid"));
  return normalized;
}

function normalizeName(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  if (normalized.length > INPUT_LIMITS.accountName)
    throw new TeamStoreError(sourceText("error.team.accountNameTooLong"));
  return normalized || null;
}

function normalizeAvatarUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.length > INPUT_LIMITS.avatarUrl) throw new TeamStoreError(sourceText("error.team.avatarUrlTooLong"));
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TeamStoreError(sourceText("error.team.avatarUrlInvalid"));
  }
  return url.toString();
}

function validateServerName(value: string): void {
  const normalized = value.trim();
  if (normalized.length < INPUT_LIMITS.serverNameMin || normalized.length > INPUT_LIMITS.serverName) {
    throw new TeamStoreError(
      sourceText("error.team.serverNameLength", { min: INPUT_LIMITS.serverNameMin, max: INPUT_LIMITS.serverName }),
    );
  }
  if (slugifyTeamServerName(normalized).length < INPUT_LIMITS.serverNameMin) {
    throw new TeamStoreError(sourceText("error.team.serverNameHostname"));
  }
}

function identityOf(host: StoredTeam): TeamIdentity {
  return {
    serverId: host.serverId,
    serverName: host.serverName,
    fingerprint: fingerprint(host.publicKey),
    publicKey: host.publicKey,
    enabledOnLaunch: host.enabledOnLaunch,
    logoVersion: host.serverLogo?.version ?? null,
  };
}

function hostOwner(host: StoredTeam): StoredMember | undefined {
  return host.members.find((member) => member.role === "owner");
}

function ownerAccountId(host: StoredTeam): string | null {
  return hostOwner(host)?.accountId ?? null;
}

function isStoredTeamFile(value: unknown): value is StoredTeamFile {
  if (!isDynamicRecord(value)) return false;
  return (
    value.version === 2 &&
    (value.activeAccountId === null || isString(value.activeAccountId)) &&
    Array.isArray(value.hosts) &&
    value.hosts.every((host) => isStoredTeam(host))
  );
}

function isStoredTeam(value: unknown): value is StoredTeam {
  if (!isDynamicRecord(value)) return false;
  const record = value;
  const logo = record.serverLogo;
  const validLogo =
    logo === undefined ||
    (isDynamicRecord(logo) && isString(logo.version) && isString(logo.mimeType) && isAvatarMimeType(logo.mimeType));
  return (
    record.version === 1 &&
    isString(record.serverId) &&
    isString(record.serverName) &&
    isString(record.publicKey) &&
    isString(record.privateKey) &&
    Array.isArray(record.members) &&
    Array.isArray(record.invites) &&
    Array.isArray(record.sessions) &&
    validLogo &&
    (record.pendingKeyRotation === undefined ||
      (isDynamicRecord(record.pendingKeyRotation) &&
        isString(record.pendingKeyRotation.publicKey) &&
        isString(record.pendingKeyRotation.privateKey) &&
        isDynamicRecord(record.pendingKeyRotation.handover)))
  );
}

# Physical iOS developer setup

## Purpose and scope

This setup supports local Expo/native iOS development, physical-iPhone testing,
`agent-device` accessibility and semantic interaction, and EAS internal
development-client testing. It describes Apple Development signing and
development provisioning; EAS internal distribution may use an ad hoc profile
that includes the registered phone. The `agent-device` XCTest runner's
Xcode-managed wildcard development profile is separate. Neither setup is App
Store distribution or release signing.

For the local API/Metro smoke loop see
[`SMOKE_TESTING.md`](./SMOKE_TESTING.md); for compatible EAS builds and OTA
updates see [`EAS_WORKFLOW.md`](./EAS_WORKFLOW.md).

## Prerequisites

- A Mac with Xcode installed and command-line tools selected.
- Apple Developer Program access to UniMate's Apple team.
- `agent-device` installed and available on `PATH`.
- A physical iPhone that can be paired and trusted by the Mac.
- An Apple Development signing identity with its matching private key.

## Apple Developer account and team

1. In Xcode, open **Settings → Accounts** and sign in with an Apple account
   that has access to UniMate's Apple Developer Program membership.
2. Confirm the membership/team is available in Xcode. UniMate's Apple
   Developer Program Team ID is `MV9MX639KX`.
3. If the team identifier is unclear, use the membership's **Membership
   Details** page or inspect the certificate's Subject **OU**.

Do not infer the Team ID from the parentheses in the Common Name printed by
`security find-identity`. That parenthesized value can be a Team Member ID:
for example, `FL78TG7XJV` was the certificate CN identifier, while the
certificate Subject OU and Apple membership showed the actual Team ID,
`MV9MX639KX`.

## Apple Development certificate

In Xcode, open **Settings → Accounts → Manage Certificates** and confirm an
**Apple Development** certificate is available. The certificate must have its
matching private key in Keychain Access. Check for a usable signing identity
with:

```sh
security find-identity -v -p codesigning
```

Do not create additional certificates repeatedly to troubleshoot a runner
build, and do not revoke a working certificate casually. The signing identity
is separate from App Store distribution certificates and credentials.

## macOS developer permissions

Check developer-tool authorization:

```sh
/usr/sbin/DevToolsSecurity -status
id -Gn
```

If developer-tool authorization must be enabled, this is a one-time privileged
change. An agent must never run it without explicit user approval; the user
should run the following in Terminal only when required:

```sh
sudo /usr/sbin/DevToolsSecurity -enable
```

On systems that use developer-group membership for XCTest, confirm the account
is in an appropriate group. The proven UniMate Mac account had `admin` and
`_developer` membership.

In **System Settings → Privacy & Security → Developer Tools**, enable the
applications used for development, currently Terminal and Visual Studio Code.
After changing this permission, fully quit and reopen VS Code. Do not disable
SIP, Gatekeeper, or unrelated security controls.

## iPhone pairing and readiness

1. Connect the iPhone to the Mac, complete pairing, and trust the Mac on the
   phone when prompted.
2. On the iPhone, open **Settings → Privacy & Security → Developer Mode** and
   enable Developer Mode. Reboot and confirm the prompt if iOS requests it.
3. Keep the phone awake and unlocked when the requested operation needs app
   interaction, and be ready to handle an iOS authorization prompt on the
   device.
4. Check readiness with CoreDevice or the installed device tooling rather than
   assuming the phone is available:

   ```sh
   xcrun devicectl list devices
   agent-device devices --platform ios
   ```

Never commit a physical-device UDID in repository files, documentation, or
committed evidence. Local Apple/Xcode/agent-device diagnostic logs may
naturally contain it; keep those logs local and uncommitted. Redact the
identifier from user-facing summaries unless it is genuinely needed.

## Xcode 27 simulator visibility

On Xcode 27, use DeviceHub rather than the old `Simulator.app` for visible
simulator QA:

```sh
open -a DeviceHub
```

Prefer surfacing an already-booted simulator instead of creating another one.

## `agent-device` physical runner signing

The proven UniMate runner settings are:

- `AGENT_DEVICE_IOS_TEAM_ID=MV9MX639KX`
- `AGENT_DEVICE_IOS_BUNDLE_ID=com.hursty998.unimate.agentdevice.runner`

Use Automatic Signing. `agent-device` passes `-allowProvisioningUpdates`.
Normally omit both `AGENT_DEVICE_IOS_PROVISIONING_PROFILE` and
`AGENT_DEVICE_IOS_SIGNING_IDENTITY`; an existing Xcode-managed wildcard
development profile worked for this team.

First inspect devices and select the intended phone using a discovered local
identifier. The installed `agent-device prepare ios-runner` command accepts a
platform but no `--udid` flag; select a specific phone on the device operation
that supports `--udid`, then prepare the iOS runner as needed:

```sh
agent-device devices --platform ios

AGENT_DEVICE_IOS_TEAM_ID=MV9MX639KX \
AGENT_DEVICE_IOS_BUNDLE_ID=com.hursty998.unimate.agentdevice.runner \
agent-device open com.unimate.ios --platform ios \
  --udid <PHYSICAL_DEVICE_UDID> --session unimate-physical

AGENT_DEVICE_IOS_TEAM_ID=MV9MX639KX \
AGENT_DEVICE_IOS_BUNDLE_ID=com.hursty998.unimate.agentdevice.runner \
agent-device prepare ios-runner --platform ios
```

The placeholder is an identifier discovered on the developer's own machine;
never substitute a real UDID into committed documentation. Do not persist
these non-secret settings in shell startup files or global VS Code settings
during repository setup.

## Refreshing local provisioning profiles

Automatic Signing should normally manage the runner's development
provisioning. If Xcode reports that `ProcessProductPackaging` refers to a
`.mobileprovision` file that does not exist:

1. Confirm the Apple account, UniMate team, and Apple Development certificate
   with its private key first.
2. Keep Automatic Signing. If preserving local state is useful, back up the
   local cached provisioning profiles before cleanup.
3. Only if necessary, clear or move the specific stale/unwanted local cached
   profile implicated by the error. Relevant cache locations include:
   `~/Library/MobileDevice/Provisioning Profiles/` and, on newer Xcode,
   `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`.
4. In Xcode **Settings → Accounts**, refresh/download the team's existing
   profiles, then retry Automatic Signing.
5. Do not delete portal profiles or certificates as a routine fix.

For UniMate, refreshing the team's profiles through Xcode Accounts made the
existing Xcode-managed wildcard development profile available locally and
resolved the stale missing-file failure. Forcing
`AGENT_DEVICE_IOS_PROVISIONING_PROFILE` was not the fix: it switched the runner
to Manual Signing, where Xcode rejected the managed wildcard profile.

## Common failures

| Symptom                                                  | Check / recovery                                                                                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DevToolsSecurity disabled                                | Check `/usr/sbin/DevToolsSecurity -status`. Ask the user before any privileged enable command; also check Developer Tools privacy permission and restart VS Code after a change.                |
| iPhone Developer Mode disabled                           | Enable it on the phone under **Settings → Privacy & Security → Developer Mode** and complete any required reboot/confirmation.                                                                  |
| Device locked or not ready                               | Check CoreDevice/device-tool status, unlock and wake the phone, then retry. Ask the user first if readiness or a new phone-side prompt is required.                                             |
| `No Account for Team`                                    | Confirm Xcode is signed into an account with the UniMate membership and that Team ID `MV9MX639KX` appears.                                                                                      |
| Team Member ID mistaken for Team ID                      | Do not use the CN parentheses from `security find-identity`; check Apple Membership Details or certificate Subject OU.                                                                          |
| Apple Development identity missing or private key absent | Check **Manage Certificates** and Keychain Access. Avoid repeated certificate creation; confirm a valid identity with `security find-identity -v -p codesigning`.                               |
| Missing/stale `.mobileprovision` path                    | Confirm account/team/certificate, refresh the existing profiles in Xcode Accounts, and retry Automatic Signing. Do not start with a manual profile override.                                    |
| Runner bundle identifier conflict                        | Use the dedicated runner identifier `com.hursty998.unimate.agentdevice.runner`; diagnose an existing registration rather than changing UniMate's app bundle IDs.                                |
| Daemon retains old signing settings                      | Close the task session. If the daemon must be refreshed, stop it without `--clean`, then start a new command with the intended environment prefix. Do not clear runner caches after every test. |

## Physical-device interaction lifecycle

Before physical-iPhone automation:

1. Determine whether the operation needs the phone awake/unlocked or may
   trigger a passcode, trust, or authorization prompt.
2. Inspect readiness first where possible.
3. If the device is verifiably ready and no new device-side authorization is
   expected, proceed without an unnecessary user prompt.
4. Otherwise ask the user with Copilot's `askQuestion` tool before taking over
   the phone, explain the needed readiness/confirmation, and wait for the
   user's response. The user enters any PIN/passcode on the iPhone only; never
   ask them to send it in chat.
5. Do not ask again during one continuous session unless the device becomes
   locked or another approval is required.

Suggested readiness question:

> Ready for me to start the physical-iPhone test? Please unlock the iPhone,
> keep it awake, and be ready to enter the device passcode/PIN on the phone if
> iOS asks. Do not send the PIN here. Confirm when ready.

When physical-device automation is finished, close the active session, for
example `agent-device close --session unimate-physical`. Do not leave an XCTest
session controlling the phone. Do not run `agent-device daemon stop --clean`
after every test: cached runner state is useful. Stop/restart the daemon only
when changing signing environment, recovering a stale runner/session,
troubleshooting, or ending a daemon created solely for a disposable setup task.
Ending device automation does not mean deleting useful caches.

## Tool precedence

- **`agent-device`**: primary for physical interaction, semantic accessibility
  snapshots, semantic controls, screenshots, and automation sessions.
- **Apple/Xcode CLI** (`xcrun devicectl`, `security`, supported build tools, and
  agent-device runner logs): device readiness and direct signing/provisioning
  diagnosis. Keep diagnostic summaries free of unnecessary account identifiers,
  credentials, private material, and device IDs.
- **Xcode MCP**: specialist for Xcode project/build settings, destinations,
  signing/build configuration, or unclear native build failures. Do not use it
  merely because a command happens to mention Xcode; agent-device runner logs
  and Apple CLI state are usually more direct for runner signing.
- **Expo MCP**: Expo/EAS documentation and project operations, not a
  replacement for physical-device automation.

## Security

Never share or commit Apple passwords, 2FA codes, iPhone PINs/passcodes,
private signing keys, certificate private material, physical device UDIDs, or
Supabase/server secrets. Enter Apple and device credentials directly into
Apple, Xcode, or the iPhone, never into chat.

# End-to-end flows (Maestro)

docs/spec/05-quality-delivery.md §12.6. These drive a real development build (`npx expo run:android`) on an
emulator or device.

| Flow | Needs | Covers |
|---|---|---|
| `01-sign-in-screens.yaml` | A development build only | Welcome, email validation, sending a code |
| `02-application.yaml` | Backend, a fresh account with no role | Sign-in, legal name, checklist, add a vehicle |
| `03-go-online.yaml` | Backend, an approved demo driver, emulator location inside a zone | Go online, trip history, go offline |

```bash
maestro test .maestro/01-sign-in-screens.yaml
```

```bash
maestro test -e EMAIL=<new account email> -e PASSWORD=<password> .maestro/02-application.yaml
```

```bash
maestro test -e EMAIL=<demo driver email> -e PASSWORD=<password> .maestro/03-go-online.yaml
```

Pass credentials with `-e` on the command line; never write them into these files.

Not covered yet: document upload (needs the camera or a file on the device), and a full offer → trip → cash run,
which needs a passenger to request a ride at the same time (drive it through the rider-admin API).

# WSL2 + Windows 10: browser cannot reach Keycloak on `localhost:8080`

This project can work correctly even when the Keycloak UI does not open in the Windows browser.

That happens because the runtime has two different paths:

1. `user-web -> api-gateway -> keycloak`
2. `Windows browser -> WSL2 -> Docker container`

The first path is enough for login and for the project to run.
The second path is only needed when you want to open the Keycloak admin UI in the browser.

## Typical symptom

- `user-web` login works after `POST /auth/login`
- uploads and the rest of the flow work
- `http://localhost:8080/admin/` does not open in Chrome on Windows 10
- `http://localhost:8080/realms/event-pipeline/.well-known/openid-configuration` times out in the Windows browser

In this case, the most likely issue is not the Keycloak container itself. The usual problem is the network boundary between:

- Docker running inside WSL2
- the Windows host browser

## Why this happens

With WSL2, the Linux environment uses a virtualized network adapter. A container port exposed inside WSL2 does not always become reachable from `localhost` on Windows 10 in a stable way.

Common causes:

- WSL2 localhost forwarding is inconsistent after restart
- the WSL IP changed
- Windows firewall is blocking the forwarded port
- another Windows process is already using port `8080`
- Docker is running inside WSL instead of Docker Desktop integration

## What does not need to change

Do not change the project hostname configuration just to make the browser UI open.

Keep the project as-is:

- Keycloak hostname remains `http://localhost:8080`
- `api-gateway` still validates `iss` as `http://localhost:8080/realms/event-pipeline`
- `api-gateway` still talks to Keycloak internally through `http://keycloak:8080`

Changing that to a temporary WSL IP can break JWT validation and make the project less stable.

## Step 1: verify the service inside WSL

Run these commands in the WSL shell:

```bash
curl http://127.0.0.1:8080/admin/
curl http://127.0.0.1:8080/realms/event-pipeline/.well-known/openid-configuration
```

If they work in WSL but fail in Windows, the issue is the Windows-to-WSL path.

## Step 2: verify from Windows

Run these commands in Windows PowerShell:

```powershell
curl.exe http://localhost:8080/admin/
curl.exe http://localhost:8080/realms/event-pipeline/.well-known/openid-configuration
Test-NetConnection localhost -Port 8080
```

If Windows fails but WSL succeeds, use a port proxy.

## Step 3: check if Windows is already using port `8080`

In Windows PowerShell:

```powershell
netstat -ano | findstr :8080
```

If another process is bound to `8080`, fix that conflict first.

## Step 4: create a Windows port proxy to the current WSL IP

Get the current WSL IP:

```bash
hostname -I
```

Use the first IP returned, for example `172.23.214.12`.

Then, in Windows PowerShell **as Administrator**:

```powershell
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=8080 connectaddress=<WSL_IP> connectport=8080
```

Example:

```powershell
netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=8080 connectaddress=172.23.214.12 connectport=8080
```

## Step 5: allow the port in Windows Firewall

If needed, still in PowerShell as Administrator:

```powershell
netsh advfirewall firewall add rule name="WSL Keycloak 8080" dir=in action=allow protocol=TCP localport=8080
```

## Step 6: test again in the browser

After the proxy is configured, test:

- `http://localhost:8080/admin/`
- `http://localhost:8080/realms/event-pipeline/.well-known/openid-configuration`

## Important limitation

The WSL IP can change after:

- reboot
- `wsl --shutdown`
- Docker or WSL restart

When that happens, the existing `portproxy` entry may point to an old IP and stop working.

## Remove the proxy

If you need to recreate it, first remove the old rule:

```powershell
netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=8080
```

Then create it again with the new WSL IP.

## Recommended workflow

For normal project usage:

- use `user-web`
- use `api-gateway`
- do not depend on direct browser access to Keycloak

Only configure the Windows port proxy if you specifically want:

- the Keycloak admin UI
- manual inspection of realms, clients, users, and roles in the browser

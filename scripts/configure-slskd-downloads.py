#!/usr/bin/env python3
"""Configure slskd download destination to include username + full path."""

import json, sys, urllib.request, urllib.error

SLSKD_URL = "http://slskd:5030"
API = f"{SLSKD_URL}/api/v0"
USERNAME = "slskd"
PASSWORD = "slskd"

def api_request(method, path, body=None, token=None):
    url = f"{API}{path}"
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def get_token():
    status, body = api_request("POST", "/session", body={"username": USERNAME, "password": PASSWORD})
    if status not in (200, 201):
        print(f"ERROR: Auth failed ({status}): {body[:200]}")
        sys.exit(1)
    token = json.loads(body).get("token")
    if not token:
        print("ERROR: No token in auth response")
        sys.exit(1)
    return token

def get_yaml(token):
    status, body = api_request("GET", "/options/yaml", token=token)
    if status != 200:
        print(f"ERROR: Failed to get YAML ({status}): {body[:200]}")
        sys.exit(1)
    try:
        parsed = json.loads(body)
        if isinstance(parsed, str):
            return parsed
    except json.JSONDecodeError:
        pass
    return body

def modify_yaml(yaml_str):
    lines = yaml_str.split("\n")
    result = []
    in_transfers = False
    in_download = False
    in_destination = False
    inserted = False

    for line in lines:
        trimmed = line.strip()

        if trimmed == "transfers:" or trimmed.startswith("transfers:"):
            in_transfers = True
            in_download = False
            in_destination = False
            result.append(line)
            continue

        if in_transfers:
            if trimmed.startswith("download:") or trimmed == "download:":
                in_download = True
                in_destination = False
                result.append(line)
                continue

            if line and line[0] not in (" ", "\t") and not inserted:
                result.append("  download:")
                result.append("    destination:")
                result.append("      subdirectory: ${SOURCE_USERNAME}/${SOURCE_PATH}")
                inserted = True
                in_transfers = False
                in_download = False
                result.append(line)
                continue

            if in_download:
                if trimmed.startswith("destination:") or trimmed == "destination:":
                    in_destination = True
                    result.append(line)
                    continue

                if line and line[0] not in (" ", "\t") and trimmed:
                    if not inserted:
                        if not in_destination:
                            result.append("    destination:")
                        result.append("      subdirectory: ${SOURCE_USERNAME}/${SOURCE_PATH}")
                        inserted = True
                    in_download = False
                    in_destination = False
                    result.append(line)
                    continue

                if in_destination:
                    if trimmed.startswith("subdirectory:"):
                        indent = line[:len(line) - len(line.lstrip())]
                        result.append(f"{indent}subdirectory: ${{SOURCE_USERNAME}}/${{SOURCE_PATH}}")
                        inserted = True
                        continue
                    if line and line[0] not in (" ", "\t") and trimmed:
                        if not inserted:
                            result.append("      subdirectory: ${SOURCE_USERNAME}/${SOURCE_PATH}")
                            inserted = True
                        in_destination = False
                        result.append(line)
                        continue

        result.append(line)

    if not inserted:
        if in_destination:
            result.append("      subdirectory: ${SOURCE_USERNAME}/${SOURCE_PATH}")
        elif in_download:
            result.append("    destination:")
            result.append("      subdirectory: ${SOURCE_USERNAME}/${SOURCE_PATH}")
        elif in_transfers:
            result.append("  download:")
            result.append("    destination:")
            result.append("      subdirectory: ${SOURCE_USERNAME}/${SOURCE_PATH}")
        else:
            result.append("")
            result.append("transfers:")
            result.append("  download:")
            result.append("    destination:")
            result.append("      subdirectory: ${SOURCE_USERNAME}/${SOURCE_PATH}")

    return "\n".join(result)

def put_yaml(token, yaml_str):
    status, body = api_request("PUT", "/options/yaml", body=yaml_str, token=token)
    if status != 200:
        print(f"ERROR: Failed to update YAML ({status}): {body[:500]}")
        sys.exit(1)
    print("SUCCESS: slskd config updated with subdirectory = ${SOURCE_USERNAME}/${SOURCE_PATH}")

def main():
    print("Configuring slskd download destination via API...")
    token = get_token()
    print("Authenticated")

    yaml_str = get_yaml(token)
    if "${SOURCE_USERNAME}/${SOURCE_PATH}" in yaml_str:
        print("Already configured. Nothing to do.")
        return

    new_yaml = modify_yaml(yaml_str)
    put_yaml(token, new_yaml)
    print("\nDone! New downloads will be saved as <username>/<full_path>/<file>")

if __name__ == "__main__":
    main()

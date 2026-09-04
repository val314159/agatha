#!/usr/bin/env bash

set -euo pipefail

SESSION_NAME="agatha-prod"

# Each entry is "window title|working directory|optional startup command".
WINDOWS=(
  "aif|/srv/aif|"
  "melo|/srv/mytts|.v/bin/python melo/ws.py"
  "m4|/srv/m4|make honcho"
  "aif-honcho|/srv/aif|sleep 4 && make honcho"
  "nginx|/srv/nginx|make"
  "autossh|/srv/nginx|make autossh"
)

build_window_command() {
    local working_dir="$1"
    local startup_command="$2"

    if [[ -n "${startup_command}" ]]; then
        printf "cd %q && trap '' INT && ( set +e; trap - INT; %s ); trap - INT; exec bash -i" "${working_dir}" "${startup_command}"
    else
        printf 'cd %q; exec bash -i' "${working_dir}"
    fi
}

launch_initial_window() {
    local window_name="$1"
    local working_dir="$2"
    local startup_command="$3"
    local command

    command="$(build_window_command "${working_dir}" "${startup_command}")"
    screen -dmS "${SESSION_NAME}" -t "${window_name}" bash -lc "${command}"
}

launch_window() {
    local window_name="$1"
    local working_dir="$2"
    local startup_command="$3"
    local command

    command="$(build_window_command "${working_dir}" "${startup_command}")"
    screen -S "${SESSION_NAME}" -X screen -t "${window_name}" bash -lc "${command}"
}

screen_has_session() {
    screen -S "${SESSION_NAME}" -Q windows >/dev/null 2>&1
}

if ! command -v screen >/dev/null 2>&1; then
    echo "screen is not installed or not on PATH" >&2
    exit 1
fi

if screen_has_session; then
    echo "screen session '${SESSION_NAME}' already exists" >&2
    exit 1
fi

IFS='|' read -r first_window_name first_working_dir first_startup_command <<< "${WINDOWS[0]}"
launch_initial_window "${first_window_name}" "${first_working_dir}" "${first_startup_command}"

for _ in {1..20}; do
    if screen_has_session; then
        break
    fi
    sleep 0.25
done

if ! screen_has_session; then
    echo "screen session '${SESSION_NAME}' was created but never became ready" >&2
    exit 1
fi

for i in "${!WINDOWS[@]}"; do
    if [[ "${i}" -eq 0 ]]; then
        continue
    fi

    IFS='|' read -r window_name working_dir startup_command <<< "${WINDOWS[i]}"
    launch_window "${window_name}" "${working_dir}" "${startup_command}"

    sleep 0.25
done

echo "Started screen session '${SESSION_NAME}' with ${#WINDOWS[@]} windows."
echo "Attach with: screen -r ${SESSION_NAME}"

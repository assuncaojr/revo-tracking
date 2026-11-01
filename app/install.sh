#!/bin/bash
# Instala o app de coleta (debug) num aparelho ou emulador conectado e abre.
#   ./install.sh                 # único aparelho conectado
#   ./install.sh <serial>        # um aparelho específico (ver: adb devices)
# Emulador fala com a API em 10.0.2.2; aparelho real, no IP desta máquina na rede local.
set -euo pipefail
cd "$(dirname "$0")"

# O Gradle 8.12 não roda no Java 25 do Homebrew: usa o Java que vem com o Android Studio.
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"

SERIAL="${1:-$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1}' | head -1)}"
[ -z "$SERIAL" ] && { echo "Nenhum aparelho conectado (adb devices)."; exit 1; }
export ANDROID_SERIAL="$SERIAL"

if [[ "$SERIAL" == emulator-* ]]; then
  API_URL="http://10.0.2.2:8000/"
else
  IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1)"
  API_URL="http://$IP:8000/"
fi
echo "Aparelho: $SERIAL ($("$ADB" shell getprop ro.product.model | tr -d '\r'))  ·  API: $API_URL"

if ! curl -s -m 3 "${API_URL/10.0.2.2/localhost}api/health" >/dev/null; then
  echo "Aviso: a API não respondeu em ${API_URL/10.0.2.2/localhost}. Suba com: cd ../api && uv run uvicorn tracking_api.main:app --host 0.0.0.0 --port 8000"
fi

./gradlew :app:installDebug -Ptrk.apiUrl.debug="$API_URL" --console=plain -q || {
  echo
  echo "Falhou. Em Xiaomi/Redmi/Poco com INSTALL_FAILED_USER_RESTRICTED:"
  echo "  Configurações → Opções do desenvolvedor → ative 'Instalar via USB' (e 'Depuração USB (configurações de segurança)')."
  echo "  Pode pedir login na conta Mi. Na hora de instalar, confirme no celular."
  exit 1
}
for p in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION; do "$ADB" shell pm grant br.com.revomidia.tracking android.permission.$p 2>/dev/null || true; done
"$ADB" shell am start -n br.com.revomidia.tracking/br.com.revomidia.tracking.app.ui.MainActivity >/dev/null
echo "Instalado e aberto."

#pragma once

#include <Arduino.h>

// HTML embebido: Arduino IDE lo incluye al cargar el sketch, sin subir archivos aparte.
static const char kSetupPortalPage[] PROGMEM = R"ECOTRACK(
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Configurar EcoTrack</title>
  <style>
    :root{font:16px system-ui,sans-serif;color:#193329;background:#eef4ee}
    *{box-sizing:border-box}body{margin:0;padding:24px 12px}
    main{max-width:540px;margin:auto;background:white;border-radius:18px;padding:28px;box-shadow:0 8px 32px #183d2418}
    h1{margin:0 0 8px;font-size:1.7rem}p{line-height:1.5;color:#52645a}
    fieldset{border:0;padding:0;margin:24px 0 0}legend{font-weight:700;margin-bottom:12px}
    label{display:block;font-size:.9rem;font-weight:600;margin:14px 0 5px}
    input:not([type=checkbox]){width:100%;font:inherit;padding:11px;border:1px solid #baccc0;border-radius:9px}
    input:focus{outline:2px solid #358755;outline-offset:1px}
    .check{display:flex;gap:8px;align-items:center;font-weight:400}
    small{color:#607268}button{background:#236c42;color:white;border:0;border-radius:9px;padding:13px 18px;font:inherit;font-weight:700;width:100%;margin-top:24px}
    button.secondary{background:#e8f2ea;color:#236c42;margin-top:9px;padding:9px}
    button:disabled{opacity:.6}details{margin-top:24px;border-top:1px solid #d9e5db;padding-top:18px}summary{cursor:pointer;font-weight:700}
    #status{margin-top:18px;padding:12px;border-radius:9px;background:#e8f2ea;min-height:48px;white-space:pre-wrap}
  </style>
</head>
<body><main>
  <h1>Configurar EcoTrack</h1>
  <p>Ingresá el nombre y la contraseña de tu red WiFi.</p>
  <form id="config">
    <fieldset><legend>Red WiFi</legend>
      <label for="ssid">Nombre de red (SSID)</label><input id="ssid" name="ssid" list="networks" maxlength="32" required value="{{SSID}}"><datalist id="networks"></datalist>
      <button class="secondary" id="scan" type="button">Buscar redes cercanas</button>
      <label for="wifiPass">Contraseña WiFi</label><input id="wifiPass" name="wifiPass" type="password" maxlength="63" autocomplete="new-password" placeholder="Dejar vacía para conservar">
      <label class="check"><input id="openWifi" name="openWifi" type="checkbox" value="1"> La red no tiene contraseña</label>
    </fieldset>
    {{DEV_FIELDS}}
    <button id="submit" type="submit">Conectar EcoTrack</button>
  </form>
  <div id="status" role="status" aria-live="polite">Listo para configurar.</div>
  <p><small>La configuración termina cuando WiFi y el servidor EcoTrack respondan. Después esta red temporal se apagará.</small></p>
</main>
<script>
  const form=document.getElementById('config'), status=document.getElementById('status'), button=document.getElementById('submit');
  async function scan(){
    const list=document.getElementById('networks');
    try{
      const response=await fetch('/networks',{cache:'no-store'});
      const names=await response.json();
      list.replaceChildren(...names.map(name=>{const option=document.createElement('option');option.value=name;return option}));
      status.textContent=names.length?'Redes encontradas. Elegí una o escribí el nombre manualmente.':'No se encontraron redes. Podés escribir el nombre manualmente.';
    }catch(_){status.textContent='No se pudieron buscar redes; escribí el nombre manualmente.'}
  }
  document.getElementById('scan').addEventListener('click',scan);
  async function refresh(){
    try{
      const response=await fetch('/status',{cache:'no-store'}), value=await response.text();
      if(value==='WIFI_CONNECTING') status.textContent='Conectando a WiFi…';
      else if(value==='MQTT_CONNECTING') status.textContent='WiFi conectado. Verificando el servidor EcoTrack…';
      else if(value==='NTP_SYNCING') status.textContent='WiFi conectado. Sincronizando la hora para validar TLS…';
      else if(value==='NTP_FAIL') {status.textContent='No se pudo sincronizar la hora por NTP; no se abrió una conexión MQTT segura. Reintentando…';button.disabled=false;}
      else if(value.startsWith('READY:')) {status.textContent='Configuración completa. EcoTrack ya se conectó; podés volver a tu red WiFi. Esta red temporal se apagará en unos segundos.';button.disabled=true;}
      else if(value==='WIFI_FAIL') {status.textContent='No se pudo conectar a WiFi. Revisá el nombre y la contraseña de la red.';button.disabled=false;}
      else if(value.startsWith('MQTT_FAIL:')) {status.textContent='WiFi conectó, pero el servidor EcoTrack no respondió (código '+value.slice(10)+').';button.disabled=false;}
      else if(value==='ERR_SAVE') {status.textContent='No se pudo guardar la configuración. Probá de nuevo.';button.disabled=false;}
    }catch(_){}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();button.disabled=true;status.textContent='Validando datos…';
    try{
      const response=await fetch('/save',{method:'POST',body:new URLSearchParams(new FormData(form))});
      status.textContent=await response.text();
      if(!response.ok){button.disabled=false}
    }catch(_){status.textContent='Se perdió la conexión con el ESP32.';button.disabled=false;}
  });
    (function(){
    document.querySelectorAll('input[type=password]').forEach(function(campo){
      const b=document.createElement('button');
      b.type='button';b.className='secondary';b.textContent='Mostrar';
      b.addEventListener('click',function(){
        const oculto=campo.type==='password';
        campo.type=oculto?'text':'password';
        b.textContent=oculto?'Ocultar':'Mostrar';
      });
      campo.insertAdjacentElement('afterend',b);
    });
    ['setupPin','ssid','wifiPass'].forEach(function(n){
      const c=document.getElementById(n);
      if(c){c.setAttribute('autocapitalize','none');c.setAttribute('autocorrect','off');c.setAttribute('spellcheck','false');}
    });
  })();
  setInterval(refresh,1000);
  scan();
</script></body></html>
)ECOTRACK";

static const char kSetupPinPage[] PROGMEM = R"ECOTRACK_PIN(
<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Desbloquear EcoTrack</title><style>
body{font:16px system-ui,sans-serif;background:#eef4ee;margin:0;padding:24px 12px}
main{max-width:540px;margin:auto;background:white;border-radius:18px;padding:28px}
input,button{width:100%;font:inherit;padding:12px;margin-top:12px;box-sizing:border-box}
button{background:#236c42;color:white;border:0;border-radius:9px;font-weight:700}
#status{margin-top:18px}
</style></head><body><main><h1>Configurar EcoTrack</h1>
<p>Ingresá el PIN de instalación para continuar.</p>
<form id="unlock"><label for="setupPin">PIN de instalación</label>
<input id="setupPin" name="setupPin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required>
<button type="submit">Desbloquear configuración</button></form><p id="status" role="status"></p>
<script>
document.getElementById('unlock').addEventListener('submit',async function(event){
event.preventDefault();const response=await fetch('/unlock',{method:'POST',body:new URLSearchParams(new FormData(this))});
document.getElementById('status').textContent=await response.text();
if(response.ok) window.location='/';
});
</script></main></body></html>
)ECOTRACK_PIN";

#ifdef ECOTRACK_DEV_PORTAL
static const char kSetupDevFields[] PROGMEM = R"ECOTRACK_DEV(
<details id="advanced"><summary>Opciones avanzadas del servidor</summary>
<fieldset><legend>Conexión MQTT</legend>
<label for="mqttHost">IP o nombre del broker</label><input id="mqttHost" name="mqttHost" maxlength="253" value="{{MQTT_HOST}}">
<label for="deviceId">ID del dispositivo</label><input id="deviceId" name="deviceId" maxlength="32" value="{{DEVICE_ID}}">
<label for="mqttUser">Usuario MQTT</label><input id="mqttUser" name="mqttUser" maxlength="64" value="{{MQTT_USER}}">
<label for="mqttPass">Contraseña MQTT</label><input id="mqttPass" name="mqttPass" type="password" maxlength="128">
</fieldset></details>
)ECOTRACK_DEV";
#endif

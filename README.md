# VTT Offline 🎲🗺️

Tablero virtual de rol (VTT) 100% offline y Progressive Web App (PWA) para partidas presenciales. El máster gestiona la partida desde su ordenador con todas las herramientas de control y proyecta únicamente el tablero en una segunda pantalla (TV o monitor secundario conectado por HDMI) para los jugadores.

Desplegable de forma inmediata como SPA estática en **Vercel**, **Netlify** o **GitHub Pages**, o ejecutable en red local. Funciona sin internet tras la primera carga gracias a su Service Worker y persistencia en IndexedDB.

---

## 🛠️ Stack Tecnológico

- **Aplicación Web**: Vite + React 18 + TypeScript + Tailwind CSS
- **PWA / Offline**: Service Worker con `vite-plugin-pwa` (Workbox) y Web App Manifest
- **Renderizado 2D/WebGL**: PixiJS v8
- **Gestión de Estado**: Zustand
- **Sincronización Multiventana**: BroadcastChannel API (sincronización instantánea de estado, regla y cámara entre pestañas/ventanas del navegador)
- **Persistencia Local**: Dexie (IndexedDB)
- **Gestión de Pantallas**: Window Management API (`window.getScreenDetails`)
- **Acceso a Archivos**: File System Access API (`showSaveFilePicker` / `showOpenFilePicker`) con fallback de descarga/subida clásica
- **Empaquetado de Partidas**: JSZip (`.vttsave`)
- **Iconografía**: Lucide React

---

## 📋 Requisitos Previos

- [Node.js](https://nodejs.org/) v18 o superior.
- `npm` v9 o superior.

---

## 🚀 Instalación y Puesta en Marcha en Local

### 1. Clonar e Instalar Dependencias

```bash
git clone <url-del-repositorio>
cd "VTT Rol"
npm install
```

### 2. Ejecutar en Desarrollo

```bash
npm run dev
```

Abre tu navegador en `http://localhost:5173`:
1. **Ventana Máster**: La vista principal con la barra superior de herramientas, biblioteca de assets, control de capas y propiedades.
2. **Ventana de Jugadores**: Pulsa en el botón superior **"Abrir pantalla de jugadores"** (o accede a `http://localhost:5173/?window=players`).
   - En navegadores compatibles (Chrome / Edge con Window Management API), te permite elegir directamente en qué pantalla secundaria abrirla.
   - En cualquier otro navegador, abre una ventana emergente limpia: arrástrala a la TV/monitor y pulsa <kbd>F11</kbd> o el botón flotante de pantalla completa.

### 3. Ejecutar Tests

```bash
npm test
```

Ejecuta la suite de pruebas unitarias con Vitest (parser de Universal VTT y cálculos de distancias de regla D&D 5e).

---

## 🌐 Despliegue en Vercel

El proyecto incluye el archivo de configuración [`vercel.json`](file:///Users/carloscano/Desktop/Carlos%20apps/VTT%20Rol/vercel.json) configurado para aplicaciones Single-Page Application (SPA) con Vite.

1. Conecta el repositorio en [Vercel](https://vercel.com).
2. Parámetros de compilación:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. ¡Listo! La aplicación se desplegará y funcionará 100% offline tras abrirla por primera vez.

---

## 🖥️ Arquitectura de Sincronización Web

- **Sin Servidor ni Backend**: Toda la sincronización se realiza en el cliente a través de **BroadcastChannel API**.
- **Sincronización Ligera**: Nunca se transfieren blobs ni imágenes por el canal. La ventana máster envía el estado ligero (entidades, identificadores, regla y cámara). La ventana de jugadores carga las texturas desde la base de datos compartida IndexedDB (Dexie) por `assetId`.
- **Filtrado Estricto**: Las entidades con `visibleToPlayers = false` (o paredes invisibles) nunca se renderizan en la pantalla de jugadores.
- **Autoguardado Seguro**: Cada 60 segundos y automáticamente al cerrar o recargar la pestaña (`beforeunload` / `pagehide`).

---

## 📐 Mapas Universal VTT y Cuadrícula

- Soporte para mapas `.dd2vtt`, `.uvtt` y `.df2vtt`.
- Ajuste automático de escala `grid.size / pixelsPerGrid` para alinear casillas a la cuadrícula global.
- Ajuste magnético (Snap to Grid) y desplazamiento fluido.
- Herramienta de **Pared Invisible** (<kbd>W</kbd>) para añadir muros no visibles a jugadores que vinculan su posición al mapa.

---

## 📏 Regla Simplificada (D&D 5e)

- Medición en casillas y pies (**1 casilla = 5 pies**), por ejemplo: `6 casillas · 30 pies`.
- Dos modos de medición:
  - **Línea**: Distancia Chebyshev oficial D&D 5e en cualquier ángulo libre.
  - **Círculo**: Radio circular en casillas y pies.
- Interruptor para mostrar o esconder la regla a los jugadores en tiempo real.

---

## 💾 Partidas y Archivos

- **Duplicar partida**: Genera una copia independiente con nuevo ID y nombre `<nombre> (Copia)`.
- **Guardar en archivo...**: Exporta la partida y todos sus mapas/tokens en un archivo `.vttsave` (ZIP) usando la File System Access API o descarga directa.
- **Abrir archivo...**: Abre archivos `.vttsave` e importa mapas y tokens a IndexedDB.
- **Autoguardado**: Copia de seguridad automática en el navegador.

---

## ⌨️ Atajos de Teclado (Ventana Máster)

| Atajo | Acción |
|---|---|
| <kbd>V</kbd> | Herramienta de Selección y movimiento |
| <kbd>H</kbd> / <kbd>Espacio</kbd> + Arrastrar | Paneo de cámara |
| <kbd>M</kbd> | Regla de distancia |
| <kbd>W</kbd> | Pared invisible (Doble clic o Enter termina, Esc cancela) |
| <kbd>Supr</kbd> / <kbd>Backspace</kbd> | Eliminar entidades seleccionadas |
| <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>S</kbd> | Abrir Gestor de Partidas / Guardar |
| <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>Z</kbd> | Deshacer |
| <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>Y</kbd> / <kbd>Shift</kbd>+<kbd>Cmd</kbd>+<kbd>Z</kbd> | Rehacer |
| <kbd>Rueda del ratón</kbd> | Zoom centrado en la posición del puntero |
| <kbd>F11</kbd> (en jugadores) | Alternar pantalla completa |

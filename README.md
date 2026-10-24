# VTT Offline 🎲🗺️

Tablero virtual de rol (VTT) 100% offline para partidas presenciales. El máster gestiona la partida desde su portátil con todas las herramientas de control y proyecta únicamente el tablero en una segunda pantalla conectada por HDMI (TV o monitor) para los jugadores.

---

## 🛠️ Stack Tecnológico

- **Entorno de Escritorio**: Electron + Vite
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Renderizado 2D/WebGL**: PixiJS v8
- **Gestión de Estado**: Zustand
- **Persistencia Local**: Dexie (IndexedDB)
- **Empaquetado de Partidas**: JSZip (.vttsave)
- **Iconografía**: Lucide React
- **Totalmente Offline**: Sin dependencias ni peticiones de red en tiempo de ejecución.

---

## 📋 Requisitos Previos

- [Node.js](https://nodejs.org/) v18 o superior.
- `npm` v9 o superior.

---

## 🚀 Instalación y Puesta en Marcha

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

Este comando arrancará el servidor de desarrollo de Vite y abrirá automáticamente las dos ventanas de Electron:
1. **Ventana Máster**: Con la interfaz completa, barra superior, panel lateral y herramientas de control.
2. **Ventana Jugadores**: Vista limpia y sin UI. Si hay una segunda pantalla conectada, se abre a pantalla completa en ella. Si no hay segunda pantalla, se abre en modo ventana normal para permitir pruebas durante el desarrollo.

### 3. Ejecutar Tests

```bash
npm test
```

Ejecuta la suite de pruebas unitarias con Vitest (cálculos de distancias de regla y parser de mapas Universal VTT).

---

## 📦 Generación de Ejecutables

### Compilación Básica
Compila el código TypeScript y empaqueta el frontend y los scripts de Electron:
```bash
npm run build
```

### Ejecutable para Windows (`.exe` / instalador y portable)
```bash
npm run dist:win
```
Genera los instaladores en la carpeta `release/`.

### Ejecutable para macOS (`.dmg` / `.zip`)
```bash
npm run dist:mac
```

---

## 🖥️ Arquitectura de Ventanas y Sincronización

- **Ventana Máster**:
  - Alberga el estado maestro de la partida (`useGameStore`).
  - Permite importar mapas, colocar tokens, dibujar cuadrículas, medir distancias y gestionar capas.
  - Muestra elementos visibles y ocultos (los ocultos aparecen semitransparentes con indicador de ojo).
  - Incluye controles de cámara para "Enviar vista a jugadores" o activar "Seguir mi cámara".
  - Botón "Pantalla jugadores" para mover la ventana de jugadores a cualquier monitor/TV detectado en caliente y activar pantalla completa.
- **Ventana Jugadores**:
  - Vista pasiva de sólo lectura.
  - Sincronización ligera por IPC: **nunca** se transmiten imágenes ni datos binarios por IPC, solo estados y posiciones. Los assets se cargan directamente desde la base de datos compartida IndexedDB (Dexie) y se cachean en memoria.
  - Filtrado estricto: Las entidades con `visibleToPlayers = false` no existen en la escena de jugadores.
  - Atajo <kbd>F11</kbd> en la ventana de jugadores para alternar pantalla completa.

---

## 📐 Mapas Universal VTT y Cuadrícula

- Soporte nativo para archivos Universal VTT (`.dd2vtt`, `.uvtt`, `.df2vtt`).
- Paredes, portales y luces se transforman desde coordenadas locales relativas al origen del mapa.
- Al importar un mapa, su escala se calcula automáticamente como `cuadrícula / pixelsPerGrid` para que coincida exactamente con la cuadrícula global.
- Al modificar el tamaño de casilla de la cuadrícula, todos los mapas presentes se reescalan automáticamente para mantenerse perfectamente alineados.
- Desplazamiento de mapas con ajuste magnético (Snap to Grid) a las intersecciones de la cuadrícula.
- Tablero infinito con capacidad para colocar múltiples mapas simultáneos.

---

## 📏 Herramienta de Regla

- **Modo Línea Recta**: Medición en casillas.
- **Modo Radial**: Círculo con radio en casillas y píxeles.
- **Regla de Diagonales**:
  - **D&D 5e**: Cada diagonal cuenta como 1 casilla (distancia Chebyshev).
  - **Alterna (3.5 / Pathfinder)**: Diagonales alternan 1-2-1-2 casillas (1, 3, 4, 6...).
- **Visibilidad Compartida**: Interruptor para proyectar la regla en tiempo real a la pantalla de los jugadores o mantenerla visible solo para el máster.

---

## 💾 Sistema de Guardado y Archivos `.vttsave`

- **Autoguardado Automático**: Cada 60 segundos y al cerrar la aplicación (con confirmación por IPC y timeout de 3 segundos).
- **Guardar / Guardar como / Cargar**: Almacenamiento instantáneo en Dexie IndexedDB.
- **Exportar e Importar `.vttsave`**: Archivo comprimido ZIP que contiene el JSON con todo el estado de la partida y una carpeta con todos los blobs de imágenes/mapas utilizados, lo que permite transferir partidas completas a otro ordenador sin conexión a internet.

---

## ⌨️ Atajos de Teclado (Ventana Máster)

| Atajo | Acción |
|---|---|
| <kbd>Supr</kbd> / <kbd>Backspace</kbd> | Eliminar entidades seleccionadas |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Guardar partida / autoguardado |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Deshacer |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> | Rehacer |
| <kbd>Espacio</kbd> + Arrastrar | Paneo de cámara |
| <kbd>Rueda del ratón</kbd> | Zoom centrado en la posición del cursor |
| <kbd>Esc</kbd> | Cancelar herramienta / limpiar selección |
| <kbd>F11</kbd> (en ventana jugadores) | Alternar pantalla completa |

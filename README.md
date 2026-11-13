# Datos abiertos para la web de Cota

Ficheros que la web de Cota (https://julioquircea.github.io/cota/) no puede leer directamente
desde el navegador porque la fuente no lo permite, y que una tarea de GitHub Actions
actualiza y publica aquí con GitHub Pages.

- `carreteras.json`: incidencias en las carreteras de acceso a cada estación (de momento
  Baqueira-Beret: N-230, C-28, C-13 y N-260). Fuente: Servei Català de Trànsit, incidencias
  en tiempo real en DATEX2 publicadas en el Punto de Acceso Nacional de Tráfico de la DGT
  (https://nap.dgt.es/dataset/incidencias-sct). Se comprueba cada 15 minutos
  (`.github/workflows/carreteras.yml`, `tools/carreteras.mjs`).

Se publica tal cual, sin interpretar: ante cualquier duda, manda la información oficial del
Servei Català de Trànsit.

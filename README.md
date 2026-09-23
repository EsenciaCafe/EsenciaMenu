# Gestor de Promos · Esencia

## Carta visual y editor actualizado

La carta principal está en [`index.html`](index.html) y se edita desde [`admin/`](admin/index.html). Incluye fotos de categorías y artículos, el logo real, el popup existente y extras sin selección ni total. Se muestran los alérgenos registrados de productos y extras, sin notas internas. Cuando faltan datos se invita a consultar al equipo; los datos de Firebase tienen prioridad sobre la base inicial. La ruta /propuesta/ redirige a la carta principal. Consulta [la guía de edición](propuesta/PROPUESTA.md).

Para probar en local, sirve esta carpeta con `python -m http.server 4173 --bind 127.0.0.1` y abre `http://127.0.0.1:4173/`. El editor usa la cuenta y los datos actuales de Firebase. La versión anterior queda conservada en el historial de Git.

Archivos incluidos:

- `promo-manager.html` → panel web para activar/desactivar y cambiar la imagen promocional.
- `.github/workflows/update-popup-images.yml` → GitHub Action que actualiza automáticamente `assets/popup/images.json`.
- `assets/popup/images.json` → lista de imágenes disponibles para la galería.

## Dónde subirlo

Sube `promo-manager.html` en la raíz del repo:

```txt
EsenciaMenu/promo-manager.html
```

Sube el workflow aquí:

```txt
EsenciaMenu/.github/workflows/update-popup-images.yml
```

Cuando subas imágenes a:

```txt
EsenciaMenu/assets/popup/
```

GitHub actualizará automáticamente:

```txt
EsenciaMenu/assets/popup/images.json
```

## URL esperada

```txt
https://esenciacafe.github.io/EsenciaMenu/promo-manager.html
```

Mi pedido es una lista personal: cantidades y notas libres de extras/preparación, sin total ni envío al local. Se guarda en localStorage durante 24 horas desde el último cambio y permite copiar el texto. Prueba de navegador: tests/order-browser-check.js (servidor local en 4173).

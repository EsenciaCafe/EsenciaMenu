# Carta visual de Esencia — versión con editor

La nueva carta está en `propuesta/` y el editor actualizado en `admin/`. La página inicial de la carta anterior sigue en `index.html`; estos cambios todavía no se han publicado en GitHub Pages.

## Cambios solicitados

- El encabezado y el pie usan el archivo real `logo_letras.png`. Sus márgenes transparentes se encuadran con CSS; el archivo no se altera.
- La carta consulta las secciones, artículos, precios, disponibilidad y ajustes actuales en Firebase al abrirse. Ya no utiliza la copia de precios de la primera propuesta.
- El editor gestiona las seis categorías visuales, sus nombres ES/EN, descripciones y fotografías. Permite asignar nuevas secciones a esas categorías.
- Cada artículo, topping y base puede tener su propia fotografía. En la portada también se puede sustituir el dibujo principal por una imagen.
- Los extras y toppings se muestran como catálogo con su precio individual y alérgenos consultables. No hay casillas de selección, pedidos ni suma de importes.
- El popup lee los mismos campos `promo_*` que la carta anterior y el gestor de promociones. Aparece al entrar cuando está activado y su imagen carga correctamente. El botón «Café del mes» permite abrirlo otra vez. Las rutas `assets/popup/…` se resuelven desde la raíz del repositorio.

## Cómo editar

1. Abre `admin/` e inicia sesión con tu cuenta habitual de Firebase.
2. Pulsa «Fotos y categorías» para cambiar las imágenes y textos de la portada. «Cambiar foto de portada» modifica la imagen principal.
3. Para la foto de un producto, entra en su categoría y pulsa «Editar» en el artículo. La foto de la base de mini pancakes se cambia en «Editar sección».
4. Elige «Subir foto» para seleccionar JPG, PNG o WebP desde el móvil u ordenador, o pega una URL directa/ruta de imagen. Comprueba la vista previa y pulsa «Guardar». «Quitar foto» se aplica únicamente al guardar; cancelar no cambia los datos.
5. Abre «Ver nueva carta» o recarga su página para ver lo guardado. Los dibujos sirven de respaldo hasta añadir tus fotos.
6. «Café del mes / popup» abre el gestor de promociones que ya utilizas.

Los productos y precios se comparten con la carta anterior porque ambas leen las mismas colecciones. Las fotos, textos de categorías visuales y asignaciones de la nueva carta son campos adicionales y no cambian la presentación de la versión anterior.

## Ajustar el encuadre de una foto

Al editar una foto ya guardada o subir una nueva, aparece un marco con el mismo formato de la carta:

1. Elige «Dónde aparece»: tarjeta, cabecera, ficha ampliada, extra o portada. En la base de mini pancakes, la vista principal es «Tarjeta ancha (producto único)».
2. Elige «Móvil» o «Escritorio». Cada espacio y dispositivo guarda su encuadre independiente.
3. Arrastra con ratón o dedo y usa «Acercar / alejar». Los controles horizontal y vertical, o las flechas del teclado sobre el marco, permiten afinar la posición.
4. «Restablecer esta vista» vuelve a centrar esa vista sin cambiar las demás. «Cancelar» descarta los cambios. «Guardar» los aplica.

El marco se muestra a escala y comparte sus proporciones con la carta. Para garantizar que el recorte coincida a diferentes anchos de pantalla, las zonas de foto utilizan proporciones estables para móvil y escritorio. La foto original guardada no se recorta de forma destructiva: se conservan posición y zoom en `image_frame` junto a la URL (en la portada, `visual_hero_frame`). Las imágenes antiguas se mantienen centradas hasta ajustarlas. Sustituir la foto inicia un encuadre nuevo.

## Alérgenos

El cruce interno del 23/09/2026 se conserva como borrador, vinculado por los identificadores originales. Se separan los alérgenos identificados, posibles trazas y pendientes. «Mis alérgenos» resalta coincidencias conocidas y no clasifica los productos como aptos.

El detalle del producto base y el de cada extra son independientes; no se calcula una declaración de una combinación. Las sustituciones se consultan con el equipo. Si se cambia el nombre o la descripción de un artículo y ya no coincide con el cruce, su información queda pendiente en lugar de conservar automáticamente una declaración antigua. La edición del nombre o descripción de una base también exige revisar sus alérgenos. La validación definitiva de recetas sigue pendiente.

## Almacenamiento y compatibilidad

- Fotografías de artículos/toppings: `sections/{sección}/items/{id}.image_url` y `sections/{sección}/toppings/{id}.image_url`.
- Base: `sections/{sección}.base.image_url`.
- Categorías: `settings/menu.visual_categories.{id}` con `name_es`, `name_en`, `desc_es`, `desc_en`, `image_url`.
- Imagen principal: `settings/menu.visual_hero_image`.
- Asignación de sección: `sections/{sección}.visual_category`. Las secciones existentes conservan una asignación automática por identificador.

Las fotos subidas se convierten en el navegador a WebP de hasta 96 KiB de texto codificado y se guardan junto al registro, usando las escrituras autenticadas de Firestore que ya usa el editor. Así no hace falta configurar un servicio de almacenamiento adicional. El límite mantiene las seis imágenes de categoría y la de portada, juntas, por debajo del límite de documento con los ajustes actuales. También se admiten URLs externas; para un catálogo muy grande o fotos de mayor resolución convendrá trasladar las imágenes a almacenamiento dedicado. Las URL se validan y las imágenes que fallen tienen una presentación de respaldo.

No se han cambiado las reglas de Firebase, creado cuentas, guardado credenciales ni escrito datos de prueba en producción. El editor conserva su autenticación. Los permisos reales de escritura siguen dependiendo de las reglas y cuenta existentes.

## Comprobación

- Seis pruebas de datos, incluidos límites del encuadre y desplazamiento al arrastrar: edición y ocultación, categorías nuevas, base y revisión de alérgenos, validación de imágenes.
- Prueba de navegador completa con Firebase sustituido por un almacén aislado: subir/comprimir foto, guardar por URL, cancelar, quitar foto, categorías, portada, artículos, base, topping gratuito, nueva sección, conservación del popup y ajustes anteriores, lectura desde la carta, productos ocultos, fallo de conexión y reintento.
- Comprobado que el encuadre de la vista previa coincide con el renderizado de la carta en móvil y escritorio, que se conserva al reabrir y que cancelar un restablecimiento no cambia lo guardado.
- Confirmado que no quedan controles de selección de extras ni total acumulado.
- Lectura real de la carta y del popup activo, y revisión visual del logo y la promoción a 390 px.

Desde la raíz del repositorio:

```sh
python -m http.server 4173 --bind 127.0.0.1
npm test
npx --yes --package @playwright/cli playwright-cli -s=editor-check open about:blank
npx --yes --package @playwright/cli playwright-cli -s=editor-check run-code --filename=tests/editor-browser-check.js
```

Carta: `http://127.0.0.1:4173/propuesta/`. Editor: `http://127.0.0.1:4173/admin/`.

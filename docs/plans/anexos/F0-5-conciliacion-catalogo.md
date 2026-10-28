# F0·5 · Conciliación del catálogo con la dueña

Pedido de confirmación de D12, que bloquea F9 (migración del catálogo al sistema). Sale de §4.8 del
plan: la comparación entre lo que publica hoy la web y lo que tiene cargado el sistema.

- **Estado:** respondido por Pablo el 2026-10-28 (tabla del final). Lo que depende de la base real
  del sistema se concilia al final del proyecto.
- **Dato clave:** la base de tienda3d de este equipo **no es la del sistema en uso**. La real la tiene
  Camila; Pablo le pide un dump al final y recién ahí se comparan tienda y sistema con datos reales.

---

## Mensaje para enviar

> Hola! Estamos pasando la tienda online al sistema de gestión: los productos, precios y colores
> que se ven en la web van a salir directamente del sistema, así se cargan una sola vez. Antes de
> pasar el catálogo necesito que me confirmes algunas cosas:
>
> **1. Diferencias entre la web y el sistema**
>
> - **Cuaderno A5 Monocromático:** en la web figura con el código TPK-PROD-000001 y en el sistema
>   con PTK-PROD-000001. Entiendo que es el mismo producto y que en la web hay un error de tipeo,
>   ¿es así?
> - **Cuaderno A5 Noche / Día** y **Cuaderno A5 Riso:** están en la web pero no en el sistema.
>   ¿Los cargamos en el sistema (con su receta, para que tengan precio) o dejan de venderse?
> - **Lámpara Trapecio:** la web ofrece el tamaño **380** y en el sistema está cargada como
>   **Trapecio 390**. ¿Cuál es la medida correcta?
>
> **2. Colores**
>
> La web ofrece estos 11 colores: Blanco, Negro, Perla, Marrón, Vainilla, Beige, Verde Militar,
> Verde Manzana, Verde Oliva, Gris carbón y Frutilla. En el sistema hoy solo está cargado el
> Blanco. ¿Son todos de PLA Genérico? ¿Siguen todos disponibles? Si hay alguno de otro material o
> que ya no se consigue, avisame.
>
> **3. Precios**
>
> Desde ahora el precio de la web va a ser el mismo que el de **Venta Directa** del sistema,
> redondeado a $50 hacia arriba. Algunos precios van a cambiar un poco. Antes de publicar te mando
> la comparación producto por producto para que la revises.
>
> **4. Productos nuevos para la web**
>
> En el sistema hay productos que hoy no están en la web: Tina, Clásica, los cuadernos con logo,
> el Cuaderno A4, llaveros, mates, cajas de figuritas, vaso porta objeto. ¿Querés publicar alguno?
>
> Gracias!

---

## Respuestas

| #   | Pregunta                                                   | Respuesta                                                                                                                                                         | Fecha      |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1a  | Monocromático: TPK = PTK (mismo producto)                  | Se concilia al final, contra el dump de la base real (F9·3).                                                                                                      | 2026-10-28 |
| 1b  | Noche / Día y Riso: cargar en el sistema o dejar de vender | Ídem: al final, con la base real.                                                                                                                                 | 2026-10-28 |
| 1c  | Trapecio: 380 o 390                                        | Ídem: al final, con la base real.                                                                                                                                 | 2026-10-28 |
| 2   | Colores: línea de filamento y disponibilidad               | Se amplían los colores del sistema: la tienda **no ofrece colores que no estén en el sistema**. Por ahora en PLA Genérico; la línea real se confirma con el dump. | 2026-10-28 |
| 3   | Precios: revisa la comparación antes de publicar (F9·3)    | OK.                                                                                                                                                               | 2026-10-28 |
| 4   | Productos del sistema a publicar                           | Los publica la dueña después, desde el panel del sistema.                                                                                                         | 2026-10-28 |

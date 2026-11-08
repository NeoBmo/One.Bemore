---
title: 'Introducción a Markdown'
description: 'Este documento está diseñado para ayudarte a dominar la creación de contenido estructurado y legible utilizando Markdown'
pubDate: 'Nov 02 2023'
type: ensenanza
series: Markdown
order: 1
---
Markdown es un lenguaje de marcado ligero creado por John Gruber y Aaron Swartz en 2004. La idea detrás de Markdown era simple: diseñar un sistema fácil de entender y usar para dar formato al texto sin necesidad de utilizar un lenguaje más complejo como HTML. El objetivo era permitir que cualquier persona, incluso sin conocimientos técnicos, pudiera crear contenido atractivo y bien formateado.

Este documento contiene el conocimiento introductorio, la sintaxis básica de la creación de contenido estructurado y legible utilizando Markdown. Ya sea que estés escribiendo documentos, blogs o mensajes en línea, Markdown ofrece una sintaxis sencilla y eficaz para formatear tu texto.

## **Títulos y encabezados**

Se crean utilizando el símbolo #. Cuantos más # uses, menor será el tamaño del título.

```markdown
# Texto

## Texto

### Texto

#### Texto

##### Texto

###### Texto
```

## **Párrafos y salto de línea**

Markdown trata automáticamente las líneas consecutivas como párrafos. Para un salto de línea sin un nuevo párrafo, se utiliza dos espacios al final de la línea.

```markdown
Este es un parrafo.


Este es otro parrafo despues de un salto de linea.
```

## **Formateo de texto**

Estos formatos proporcionan una manera rápida y sencilla de mejorar la legibilidad y la expresividad de tu texto en Markdown.

```markdown
**Negrita** 
_Italic_ 
`Code`
~~Tachado~~
```

## **Listas ordenadas y no ordenadas**

Las listas ordenadas se crean enumerando elementos con números. Las listas no ordenadas comienzan cada elemento con un guion o asterisco. Los subelementos se indentan.

```markdown
1. item
  1. subitem
2. item
3. item

- item
  - subitem
- item
- item
```

## **Citas en bloque**

Citas en bloque representa contenido citado de otra fuente. Para agregar una citación en bloque, utiliza la siguiente el simbolo `>` en la primera linea.

```markdown
> Esto es una cita.
```

## **Línea horizontal**

Una línea horizonral secrea utilizando tres guiones `---` o tres asteriscos `***` en una linea.

```markdown
---

***
```

## **Enlaces**

Los enlaces se crean utilizando corchetes para el texto del enlace y paréntesis para la URL.

```markdown
[Texto del enlace](http://www.ejemplo.com)
```

## **Imagenes**

Las imágenes se insertan de manera similar a los enlaces, pero con un signo de exclamación `!` antes de los corchetes.

```markdown
![Texto alternativo](./ruta/de/la/imagen.jpg)
```

## **Tablas**

Las tablas son fáciles de crear utilizando una combinación de barras verticales `|` y guiones `-`. Utiliza la siguiente sintaxis para agregar una tabla:

```markdown
| Italics   | Bold     | Code   |
| --------- | -------- | ------ |
| _italics_ | **bold** | `code` |
```

## **Bloque de codigo y en línea**

Usar 3 acentos graves ` ``` ` en una nueva línea, escribir el fragmento y cerrar con 3 acentos graves en una nueva línea. Para resaltar la sintaxis específica del lenguaje, escribe una palabra del nombre del lenguaje después de los primeros 3 acentos graves, por ejemplo, html, javascript, css, markdown, typescript, txt, bash.

````markdown
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>HTML5 Document</title>
  </head>
  <body>
    <h1>Title</h1>
    <p>Test</p>
  </body>
</html>
```
````

````markdown
`print("Hello world!")`
````

En conclusión, Markdown se presenta como una herramienta sorprendentemente poderosa y accesible para dar forma a tu contenido digital. Su sintaxis sencilla y versátil te libera de las complicaciones del formateo, permitiéndote centrarte plenamente en la creación de contenido significativo.

Este es solo el aspecto más básico. Puedes visitar la página oficial y convertirte en un experto en Markdown. visita [Markdownguide.org](https://www.markdownguide.org/)

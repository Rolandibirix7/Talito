-- Esquema de TA'LITO (PostgreSQL). Es idempotente: se puede ejecutar varias veces.

CREATE TABLE IF NOT EXISTS usuarios (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(80)  NOT NULL,
    correo      VARCHAR(120) NOT NULL UNIQUE,
    clave_hash  VARCHAR(100) NOT NULL,
    rol         VARCHAR(10)  NOT NULL DEFAULT 'admin' CHECK (rol IN ('admin','caja','cocina')),
    creado_en   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categorias (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(60) NOT NULL,
    slug    VARCHAR(60) NOT NULL UNIQUE,
    orden   SMALLINT    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS platillos (
    id            SERIAL PRIMARY KEY,
    categoria_id  INTEGER       NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
    nombre        VARCHAR(100)  NOT NULL,
    descripcion   VARCHAR(255),
    precio        NUMERIC(8,2)  NOT NULL CHECK (precio >= 0),
    disponible    BOOLEAN       NOT NULL DEFAULT TRUE,
    foto          BYTEA,                 -- imagen ya reducida por el navegador (JPEG/PNG/WebP)
    foto_tipo     VARCHAR(20),
    foto_version  BIGINT        NOT NULL DEFAULT 0,   -- cambia al subir otra foto (rompe la caché)
    UNIQUE (categoria_id, nombre)
);

-- estado: nueva -> preparando -> lista -> cobrada
CREATE TABLE IF NOT EXISTS pedidos (
    id          SERIAL PRIMARY KEY,
    mesa        SMALLINT    NOT NULL CHECK (mesa BETWEEN 1 AND 99),
    nombre      VARCHAR(60) NOT NULL,
    estado      VARCHAR(12) NOT NULL DEFAULT 'nueva'
                CHECK (estado IN ('nueva','preparando','lista','cobrada')),
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    listo_en    TIMESTAMPTZ            -- cuándo cocina la marcó como lista (alimenta el historial)
);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_creado ON pedidos(creado_en);

-- Se guarda nombre y precio del momento: el historial no cambia si editan el menú.
CREATE TABLE IF NOT EXISTS detalle_pedido (
    id               SERIAL PRIMARY KEY,
    pedido_id        INTEGER      NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    platillo_id      INTEGER      REFERENCES platillos(id) ON DELETE SET NULL,
    nombre           VARCHAR(100) NOT NULL,
    precio_unitario  NUMERIC(8,2) NOT NULL,
    cantidad         SMALLINT     NOT NULL CHECK (cantidad > 0),
    nota             VARCHAR(120)           -- modificador: «Sin cebolla», «Salsa aparte»...
);
CREATE INDEX IF NOT EXISTS idx_detalle_pedido ON detalle_pedido(pedido_id);

CREATE TABLE IF NOT EXISTS llamadas_mesero (
    id          SERIAL PRIMARY KEY,
    mesa        SMALLINT    NOT NULL,
    atendida    BOOLEAN     NOT NULL DEFAULT FALSE,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bases creadas con una versión anterior: agrega las columnas nuevas (no hace nada si ya existen).
ALTER TABLE usuarios       ADD COLUMN IF NOT EXISTS rol VARCHAR(10) NOT NULL DEFAULT 'admin' CHECK (rol IN ('admin','caja','cocina'));
ALTER TABLE platillos      ADD COLUMN IF NOT EXISTS foto BYTEA;
ALTER TABLE platillos      ADD COLUMN IF NOT EXISTS foto_tipo VARCHAR(20);
ALTER TABLE platillos      ADD COLUMN IF NOT EXISTS foto_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE pedidos        ADD COLUMN IF NOT EXISTS listo_en TIMESTAMPTZ;
ALTER TABLE detalle_pedido ADD COLUMN IF NOT EXISTS nota VARCHAR(120);
CREATE INDEX IF NOT EXISTS idx_pedidos_listo ON pedidos(listo_en);

-- Retiro de la grilla vieja de llaveros (KeychainTier). La escala de llaveros
-- se unificó en keychain_scale_tiers (grilla contigua compartida por el
-- producto de catálogo y el cotizador ADHOC). Las cotizaciones históricas no
-- se afectan: guardan su snapshot (lineTotal + adhocPayload).
DROP TABLE IF EXISTS "keychain_tiers";

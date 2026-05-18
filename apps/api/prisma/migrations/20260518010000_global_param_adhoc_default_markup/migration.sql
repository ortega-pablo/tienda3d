-- Markup default para cotizaciones a medida (ADHOC libre, sin producto
-- ni templateKind keychain). Antes de este param el flujo ADHOC vendía
-- al costo (markup 0%) porque no había producto ni categoría de donde
-- resolver el targetMarkupPct. Default 60%.
--
-- Precedencia (sin cambios en el motor):
--   customer.customMarkupPct > tier.markupPct > targetMarkupPct
-- Para ADHOC libre, tier es null y targetMarkupPct ahora viene de este
-- global param (en lugar de 0).

INSERT INTO "global_params" ("key", "value", "description", "updatedAt")
VALUES (
  'adhoc_default_markup_pct',
  '60',
  'Markup default (%) para cotizaciones a medida sin producto ni tier de keychain. Cliente SPECIAL con customMarkupPct lo pisa.',
  NOW()
)
ON CONFLICT ("key") DO NOTHING;

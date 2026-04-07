-- Add shopify_store_url column for Shopify Admin API calls
-- site_url stores the public-facing domain (custom or myshopify)
-- shopify_store_url stores the .myshopify.com URL required by Admin API

ALTER TABLE sites ADD COLUMN IF NOT EXISTS shopify_store_url TEXT;

-- Backfill: if existing Shopify sites have .myshopify.com in site_url, copy it
UPDATE sites
SET shopify_store_url = site_url
WHERE cms = 'shopify' AND shopify_store_url IS NULL;

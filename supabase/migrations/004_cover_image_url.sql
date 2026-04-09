-- Add cover_image_url column to publications table
ALTER TABLE publications ADD COLUMN IF NOT EXISTS cover_image_url text;

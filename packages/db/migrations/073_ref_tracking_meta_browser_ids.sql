-- Preserve Meta browser identifiers from the LP so server-side Lead events
-- can be matched to the same browser session that generated the ad click.
ALTER TABLE ref_tracking ADD COLUMN fbc TEXT;
ALTER TABLE ref_tracking ADD COLUMN fbp TEXT;

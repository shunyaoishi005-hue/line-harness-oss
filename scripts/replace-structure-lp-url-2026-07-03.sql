-- Replace the temporary Vercel LP URL with the production Structure Partners URL.
-- Applies to future LINE replies, tracked links, and rich menu URI actions.

UPDATE auto_replies
SET response_content = replace(
  response_content,
  'https://structure-partners-lp.vercel.app',
  'https://structure-partners.jp'
)
WHERE response_content LIKE '%https://structure-partners-lp.vercel.app%';

UPDATE tracked_links
SET original_url = replace(
  original_url,
  'https://structure-partners-lp.vercel.app',
  'https://structure-partners.jp'
),
updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE original_url LIKE '%https://structure-partners-lp.vercel.app%';

UPDATE rich_menu_areas
SET action_data = replace(
  action_data,
  'https://structure-partners-lp.vercel.app',
  'https://structure-partners.jp'
),
updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now', '+9 hours')
WHERE action_data LIKE '%https://structure-partners-lp.vercel.app%';
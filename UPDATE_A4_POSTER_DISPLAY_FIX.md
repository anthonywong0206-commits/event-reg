# A4 poster display fix

## Root cause
Remote images from Supabase Storage were rendered by `EventImage` with an inline
`objectFit: "cover"`. That inline style took priority over the page CSS rule using
`object-fit: contain`, so uploaded portrait posters were still cropped.

## Fix
- Added explicit `objectFit` and `objectPosition` props to `EventImage`.
- Activity detail poster explicitly uses `objectFit="contain"`.
- Registration summary poster explicitly uses `objectFit="contain"`.
- Event cards and other thumbnails keep the existing default `cover` behaviour.
- No database migration is required.

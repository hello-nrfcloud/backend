# 004: Resolve all cell geo locations

All (single) cell geo locations are resolved as soon as a device sends new
network information instead of resolving it only on user request, or if a
websocket connection is active for the device (meaning a user is observing the
device on the web application).

This is in line with the ground fix implementation: all ground fix messages by
devices are resolved.

Resolving all device locations based on the device's network information allows
to:

1. show device location on the map immediately (if it is already resolved)
2. show an approximate location right after the device has connected (because
   one of the first messages right after boot is the device information)
3. show a location trail of the device based purely on LTE network information
4. show single cell (SCELL) vs. multi cell (MCELL) performance using nRF Cloud
   Location services (these services can be purchased individually and have
   different pricing: https://nrfcloud.com/#/pricing)

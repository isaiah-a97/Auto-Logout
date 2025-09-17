# Auto Logout After X Minutes

A Chrome extension that helps reduce procrastination by automatically logging you out of selected websites after a set time limit.

## Features

- **Shared Timer**: Single countdown across all tracked social media sites
- **Time Tracking**: Monitors active time spent on specified websites
- **Automatic Logout**: Clears cookies for ALL tracked sites when time limit is reached
- **Live Countdown**: Real-time countdown display in the extension popup
- **Smart Pausing**: Timer pauses when window is not focused or user is idle
- **Daily Reset**: Timer automatically resets at midnight each day
- **Customizable**: Configure which sites to track and time limits
- **Redirect Option**: Optionally redirect to a "time's up" page after logout
- **Tab Cleanup**: "Back to work" button closes all blocked page tabs automatically

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension icon should appear in your Chrome toolbar

## Usage

### Setting Up

1. Click the extension icon and then click "Options" (or right-click the icon → Options)
2. Configure your settings:
   - **Time limit**: How many minutes you can spend on each site
   - **Sites**: List of domains to track (one per line, e.g., `facebook.com`)
   - **Redirect**: Choose whether to redirect to a block page after logout

### Monitoring

- Click the extension icon to see the current countdown
- The popup shows:
  - Current website being tracked
  - Time remaining
  - Progress bar
  - Pause status (if window not focused or user idle)

### How It Works

- **Shared Timer**: The extension uses a single timer across all tracked sites
- The timer only counts when:
  - The browser window is focused
  - The user is not idle (moving mouse/keyboard)
  - You're on any tracked website
- **No Reset Between Sites**: Switching between Facebook, Instagram, Reddit, etc. continues the same countdown
- When the time limit is reached:
  - All cookies for ALL tracked domains are cleared (logging you out everywhere)
  - ALL tracked site tabs are redirected to the "time's up" page
  - Timer resets to 0
- **Tab Cleanup**: Clicking "Back to work" on the blocked page closes all blocked page tabs and opens a new tab
- **Daily Reset**: The timer automatically resets at midnight each day

## Default Settings

- **Time limit**: 5 minutes
- **Tracked sites**: facebook.com, instagram.com, twitter.com, x.com, tiktok.com, reddit.com, youtube.com
- **Redirect**: Enabled (shows block page)

## Permissions

This extension requires the following permissions:
- `tabs`: To monitor which tab is active
- `storage`: To save your settings and timer state
- `cookies`: To clear cookies when time limit is reached
- `idle`: To detect when you're away from the computer
- `scripting`: For internal extension functionality
- `alarms`: To schedule daily timer resets

## Troubleshooting

- **Timer not counting**: Make sure the website is in your tracked sites list and the browser window is focused
- **Timer paused**: Check if your browser window is focused and you're actively using the computer
- **Not logging out**: Ensure the website uses cookies for authentication
- **Settings not saving**: Check that you clicked "Save" in the options page
- **Timer not resetting daily**: The timer resets at midnight local time; check your system clock
- **Shared timer not working**: The timer should continue counting when switching between tracked sites

## Development

This extension uses Manifest V3 and includes:
- `manifest.json`: Extension configuration
- `background.js`: Service worker for time tracking
- `popup.html/js`: Extension popup interface
- `options.html/js`: Settings page
- `blocked.html`: "Time's up" page

## License

This project is open source and available under the MIT License.
# Auto-Logout
# Auto-Logout
# Auto-Logout

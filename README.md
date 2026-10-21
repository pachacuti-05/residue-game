# RESIDUE

A multiplayer living board game where every choice leaves permanent Residue.

## Features built so far

- Account creation with **random Role**
- Login system
- Shared 8×8 memory board
- Leave Residue on tiles (Preserve / Absorb / Corrupt) — permanent
- Public chat + Private messages (@username)
- Admin (God) can see **all** messages
- Dice-based combat (player vs player or Common Enemy)
- Bottom navigation: Board | Communicate | Skills | Role
- Hidden God powers (only for username "God"):
  - Take life
  - Give life
  - Give power points
  - Skip turn
  - Modify attack
  - Ban player
- Final rule ready: all players will fight the God at the end

## How to run it (very simple)

### 1. Install Node.js
Go to https://nodejs.org and download the LTS version. Install it.

### 2. Open a terminal in the project folder
- On Windows: open the `residue-game` folder, hold Shift + right-click → "Open PowerShell window here"
- On Mac: right-click the folder → Services → New Terminal at Folder

### 3. Install and start the server
```bash
cd server
npm install
node index.js
```

You should see: `Residue server running on port 3001`

### 4. Open the game
Open the file:
`client/public/index.html`
in your browser (Chrome or Edge recommended).

### 5. Create your God account
- Username: **God**
- Any password you like

Only this account has the God powers.

Then create normal player accounts on other devices/browsers to test multiplayer.

## Important notes

- Right now data is stored in memory (resets when server restarts). We will add a real database next.
- Voice messages and video calls will be added in the next version.
- The final "All players fight the God" climax system will be added once the core is stable.

## Next steps I will do

1. Add real database (so Residue stays forever)
2. Voice messages
3. Voice + Video calls
4. Better combat resolution & life/death
5. Turn system
6. Polish the board and animations

Just tell me when you want the next piece.

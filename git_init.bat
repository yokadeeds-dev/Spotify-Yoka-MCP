@echo off
pushd "C:\Users\kachi\Documents\##### Arbeitsroot Claude\spotify-mcp-server"
"C:\Program Files\Git\cmd\git.exe" init
"C:\Program Files\Git\cmd\git.exe" config user.email "yokadeeds@gmail.com"
"C:\Program Files\Git\cmd\git.exe" config user.name "Yoka"
"C:\Program Files\Git\cmd\git.exe" add .
"C:\Program Files\Git\cmd\git.exe" status --short
"C:\Program Files\Git\cmd\git.exe" commit -m "Initial commit: Spotify MCP Server"
echo GIT_DONE
popd

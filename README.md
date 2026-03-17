# Spinning Wheel

A real-time spinning wheel app where multiple users can join and spin together. Built with AWS SAM, WebSockets, and a simple HTML/JS frontend.

## About

This project was created following the [Kiro](https://kiro.dev) workshop. It was built entirely using spec-driven development — every feature was designed, documented, and implemented through Kiro's spec workflow before writing a single line of code.

## How it works

1. Users register their name to join the wheel
2. All participants see each other appear on the wheel in real time via WebSockets
3. Anyone can spin the wheel to pick a random winner

## Tech stack

- AWS Lambda (Node.js)
- API Gateway WebSocket API
- DynamoDB
- HTML / CSS / JS frontend
- AWS SAM for infrastructure

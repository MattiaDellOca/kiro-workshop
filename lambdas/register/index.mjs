import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;
const REGISTRATIONS_TABLE = process.env.REGISTRATIONS_TABLE;
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,DELETE,OPTIONS",
};

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { name, sessionId } = body;

    if (!name || !name.trim()) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "Name is required" }),
      };
    }

    const ttl = Math.floor(Date.now() / 1000) + 86400;

    // Store registration
    await docClient.send(
      new PutCommand({
        TableName: REGISTRATIONS_TABLE,
        Item: { sessionId, name: name.trim(), ttl },
      })
    );

    // Query connections for this session
    const connectionsResult = await docClient.send(
      new QueryCommand({
        TableName: CONNECTIONS_TABLE,
        IndexName: "SessionIndex",
        KeyConditionExpression: "sessionId = :sid",
        ExpressionAttributeValues: { ":sid": sessionId },
      })
    );

    const connections = connectionsResult.Items || [];

    // Broadcast newName to all connections in the session
    const apigw = new ApiGatewayManagementApiClient({
      endpoint: WEBSOCKET_ENDPOINT,
    });

    const message = JSON.stringify({ action: "newName", name: name.trim() });

    const postCalls = connections.map(async ({ connectionId }) => {
      try {
        await apigw.send(
          new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: message,
          })
        );
      } catch (err) {
        if (err.statusCode === 410 || err.name === "GoneException") {
          // Stale connection — delete it
          await docClient.send(
            new DeleteCommand({
              TableName: CONNECTIONS_TABLE,
              Key: { connectionId },
            })
          );
        } else {
          throw err;
        }
      }
    });

    await Promise.all(postCalls);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "registered" }),
    };
  } catch (err) {
    console.error("Error in register handler:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

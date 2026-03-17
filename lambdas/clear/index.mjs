import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
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
    const { sessionId } = body;

    // Query all registrations for this session
    const registrations = [];
    let lastKey;
    do {
      const result = await docClient.send(
        new QueryCommand({
          TableName: REGISTRATIONS_TABLE,
          KeyConditionExpression: "sessionId = :sid",
          ExpressionAttributeValues: { ":sid": sessionId },
          ...(lastKey && { ExclusiveStartKey: lastKey }),
        })
      );
      registrations.push(...(result.Items || []));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    // BatchWrite delete all registrations (max 25 per batch)
    for (let i = 0; i < registrations.length; i += 25) {
      const batch = registrations.slice(i, i + 25);
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [REGISTRATIONS_TABLE]: batch.map((item) => ({
              DeleteRequest: {
                Key: { sessionId: item.sessionId, name: item.name },
              },
            })),
          },
        })
      );
    }

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

    // Broadcast clear to all connections in the session
    const apigw = new ApiGatewayManagementApiClient({
      endpoint: WEBSOCKET_ENDPOINT,
    });

    const message = JSON.stringify({ action: "clear" });

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
      body: JSON.stringify({ message: "cleared" }),
    };
  } catch (err) {
    console.error("Error in clear handler:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

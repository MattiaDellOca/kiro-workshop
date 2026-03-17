import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
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
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT;

export const handler = async (event) => {
  const body = JSON.parse(event.body || "{}");
  const { type, name, sessionId } = body;

  if (type === "winner") {
    // Query all connections for this session
    const connectionsResult = await docClient.send(
      new QueryCommand({
        TableName: CONNECTIONS_TABLE,
        IndexName: "SessionIndex",
        KeyConditionExpression: "sessionId = :sid",
        ExpressionAttributeValues: { ":sid": sessionId },
      })
    );

    const connections = connectionsResult.Items || [];

    // Broadcast winner to all connections in the session
    const apigw = new ApiGatewayManagementApiClient({
      endpoint: WEBSOCKET_ENDPOINT,
    });

    const message = JSON.stringify({ action: "winner", name });

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
  }

  return { statusCode: 200, body: "Message sent" };
};

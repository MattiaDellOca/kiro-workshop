import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;

export const handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const sessionId = event.queryStringParameters?.sessionId;

  const ttl = Math.floor(Date.now() / 1000) + 86400;

  await docClient.send(
    new PutCommand({
      TableName: CONNECTIONS_TABLE,
      Item: { connectionId, sessionId, ttl },
    })
  );

  return { statusCode: 200, body: "Connected" };
};

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE;

export const handler = async (event) => {
  const connectionId = event.requestContext.connectionId;

  await docClient.send(
    new DeleteCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
    })
  );

  return { statusCode: 200, body: "Disconnected" };
};

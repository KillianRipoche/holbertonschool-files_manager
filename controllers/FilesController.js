import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    const validTypes = ['folder', 'file', 'image'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }

    if (!data && type !== 'folder') {
      return res.status(400).json({ error: 'Missing data' });
    }

    const filesCollection = dbClient.db.collection('files');

    if (parentId !== 0) {
      const parentFile = await filesCollection.findOne({
        _id: new dbClient.ObjectId(parentId),
      });

      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const fileDocument = {
      userId: new dbClient.ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: parentId === 0 ? 0 : new dbClient.ObjectId(parentId),
    };

    if (type === 'folder') {
      const result = await filesCollection.insertOne(fileDocument);
      return res.status(201).json({
        id: result.insertedId.toString(),
        userId,
        name,
        type,
        isPublic,
        parentId,
      });
    }

    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const localPath = path.join(folderPath, uuidv4());
    const fileContent = Buffer.from(data, 'base64');

    fs.writeFileSync(localPath, fileContent);

    fileDocument.localPath = localPath;

    const result = await filesCollection.insertOne(fileDocument);

    return res.status(201).json({
      id: result.insertedId.toString(),
      userId,
      name,
      type,
      isPublic,
      parentId,
    });
  }

  static async getShow(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const filesCollection = dbClient.db.collection('files');

    const file = await filesCollection.findOne({
      _id: new dbClient.ObjectId(fileId),
      userId: new dbClient.ObjectId(userId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId === 0 ? 0 : file.parentId.toString(),
    });
  }

  static async getIndex(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parentId = req.query.parentId || '0';
    const page = parseInt(req.query.page, 10) || 0;

    const filesCollection = dbClient.db.collection('files');

    const pipeline = [
      {
        $match: {
          userId: new dbClient.ObjectId(userId),
          parentId: parentId === '0' ? 0 : new dbClient.ObjectId(parentId),
        },
      },
      {
        $skip: page * 20,
      },
      {
        $limit: 20,
      },
    ];

    const files = await filesCollection.aggregate(pipeline).toArray();

    const result = files.map((file) => ({
      id: file._id.toString(),
      userId: file.userId.toString(),
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId === 0 ? 0 : file.parentId.toString(),
    }));

    return res.status(200).json(result);
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const filesCollection = dbClient.db.collection('files');

    const file = await filesCollection.findOne({
      _id: new dbClient.ObjectId(fileId),
      userId: new dbClient.ObjectId(userId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await filesCollection.updateOne(
      { _id: new dbClient.ObjectId(fileId) },
      { $set: { isPublic: true } },
    );

    const updatedFile = await filesCollection.findOne({
      _id: new dbClient.ObjectId(fileId),
    });

    return res.status(200).json({
      id: updatedFile._id.toString(),
      userId: updatedFile.userId.toString(),
      name: updatedFile.name,
      type: updatedFile.type,
      isPublic: updatedFile.isPublic,
      parentId: updatedFile.parentId === 0 ? 0 : updatedFile.parentId.toString(),
    });
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const filesCollection = dbClient.db.collection('files');

    const file = await filesCollection.findOne({
      _id: new dbClient.ObjectId(fileId),
      userId: new dbClient.ObjectId(userId),
    });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await filesCollection.updateOne(
      { _id: new dbClient.ObjectId(fileId) },
      { $set: { isPublic: false } },
    );

    const updatedFile = await filesCollection.findOne({
      _id: new dbClient.ObjectId(fileId),
    });

    return res.status(200).json({
      id: updatedFile._id.toString(),
      userId: updatedFile.userId.toString(),
      name: updatedFile.name,
      type: updatedFile.type,
      isPublic: updatedFile.isPublic,
      parentId: updatedFile.parentId === 0 ? 0 : updatedFile.parentId.toString(),
    });
  }
}

export default FilesController;

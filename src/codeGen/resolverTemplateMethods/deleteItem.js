import { mutationStart, mutationError, mutationOver, mutationMeta, mutationComplete } from "../mutationHelpers";

export default ({ objName, table, relationshipCleanup }) => `    async delete${objName}(root, args, context, ast) {
      if (!args._id) {
        throw "No _id sent";
      }     

      ${mutationStart({ objName, op: "delete" })}
      
      context.__mongodb = db;
      if(await canDelete("${objName}", context) == false) throw new ForbiddenError('You are not authorized to delete ${objName}'); 

      try {
        let $match = { _id: ObjectId(args._id) };
        
        if (await processHook(hooksObj, "${objName}", "beforeDelete", $match, { ...gqlPacket, db, session }) === false) {
          return { success: false };
        }
        await dbHelpers.runDelete(db, "${table}", $match);
        await processHook(hooksObj, "${objName}", "afterDelete", $match, { ...gqlPacket, db, session });
        ${relationshipCleanup}

        return await resolverHelpers.finishSuccessfulMutation(session, transaction);
      } ${mutationError()} ${mutationOver()}
    }`;

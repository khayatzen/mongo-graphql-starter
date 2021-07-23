import { mutationStart, mutationError, mutationOver, mutationMeta, mutationComplete } from "../mutationHelpers";

export default ({ objName, table }) => `    async update${objName}sBulk(root, args, context, ast) {
      ${mutationStart({ objName, op: "update" })}

      context.__mongodb = db;
      if(await canUpdate("${objName}", context) == false) throw new ForbiddenError('You are not authorized to update ${objName}'); 
      
      return await resolverHelpers.runMutation(session, transaction, async() => {
        let { $match } = decontructGraphqlQuery(args.Match, ast, ${objName}Metadata);
        let updates = await getUpdateObject(args.Updates || {}, ${objName}Metadata, { ...gqlPacket, db, session });

        if (await processHook(hooksObj, "${objName}", "beforeUpdate", $match, updates, { ...gqlPacket, db, session }) === false) {
          return resolverHelpers.mutationCancelled({ transaction });
        }
        await dbHelpers.runUpdate(db, "${table}", $match, updates, { session });
        await processHook(hooksObj, "${objName}", "afterUpdate", $match, updates, { ...gqlPacket, db, session });

        return await resolverHelpers.finishSuccessfulMutation(session, transaction);
      });
    }`;

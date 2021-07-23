import { mutationStart, mutationError, mutationOver, mutationMeta, mutationComplete } from "../mutationHelpers";

export default ({ objName, table }) => `    async update${objName}s(root, args, context, ast) {
      ${mutationStart({ objName, op: "update" })}

      context.__mongodb = db;
      if(await canUpdate("${objName}", context) == false) throw new ForbiddenError('You are not authorized to update ${objName}'); 
      
      return await resolverHelpers.runMutation(session, transaction, async() => {
        let { $match, $project } = decontructGraphqlQuery({ _id_in: args._ids }, ast, ${objName}Metadata, "${objName}s");
        let updates = await getUpdateObject(args.Updates || {}, ${objName}Metadata, { ...gqlPacket, db, session });

        if (await processHook(hooksObj, "${objName}", "beforeUpdate", $match, updates, { ...gqlPacket, db, session }) === false) {
          return resolverHelpers.mutationCancelled({ transaction });
        }
        await setUpOneToManyRelationshipsForUpdate(args._ids, args, ${objName}Metadata, { ...gqlPacket, db, session });
        await dbHelpers.runUpdate(db, "${table}", $match, updates, { session });
        await processHook(hooksObj, "${objName}", "afterUpdate", $match, updates, { ...gqlPacket, db, session });
        ${mutationComplete()}
        
        let result = $project ? await load${objName}s(db, [{ $match }, { $project }], root, args, context, ast) : null;
        return resolverHelpers.mutationSuccessResult({ ${objName}s: result, transaction, elapsedTime: 0 });
      });
    }`;

export GRPC_COUNT=$1
if [ ${GRPC_COUNT} == "" ]; then
    echo ${GRPC_COUNT}
    echo "GRPC_COUNT cannot be null."
    exit 1
fi
export ASSET_COUNT=$2
if [ ${ASSET_COUNT} == "" ]; then
    echo "ASSET_COUNT cannot be null."
    exit 2
fi
for (( org=1;org<3;org++ ))
do
    export ORG=$org;
    for (( i=0;i<${GRPC_COUNT};i++ ))
    do
        export GRPC=$i;
        node server2Orgs.js &
    done
done

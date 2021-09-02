for (( i=0;i<$1;i++ ))
do
    export GRPC=$i;
    node serverSingleOrg.js &
    sleep 240
done

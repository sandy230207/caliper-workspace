for (( i=0;i<$1;i++ ))
do
    export GRPC=$i;
    node serverSingleOrg.js &
    sleep 180
done

for (( i=0;i<$1;i++ ))
do
    export GRPC=$i;
    node serverSingleOrgNoCoinSelection.js &
done
